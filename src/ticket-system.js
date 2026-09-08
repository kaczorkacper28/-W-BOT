const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionsBitField
} = require('discord.js');

/**
 * Rozbudowany system ticketów ŻW.
 * Kategorie są wybierane przez użytkownika, a każdy ticket jest prywatny.
 * Moduł jest niezależny od konfiguracji TICKET_CATEGORY_ID — kategorię
 * nadrzędną pobiera z istniejącego kanału #kontakt.
 */
function normalize(value) {
  return String(value || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function findContact(guild) {
  return guild.channels.cache.find(c =>
    c.type === ChannelType.GuildText && ['kontakt', 'pomoc'].includes(normalize(c.name))
  );
}

function getTicketCategory(guild) {
  const contact = findContact(guild);
  if (!contact?.parent || contact.parent.type !== ChannelType.GuildCategory) return null;
  return contact.parent;
}

const TYPES = {
  pomoc: { label: 'Pomoc / pytanie', emoji: '🆘', color: ButtonStyle.Primary, title: '🆘 POMOC — ŻW' },
  rekrutacja: { label: 'Rekrutacja', emoji: '🎓', color: ButtonStyle.Success, title: '🎓 REKRUTACJA — ŻW' },
  kadry: { label: 'Sprawa kadrowa', emoji: '👮', color: ButtonStyle.Secondary, title: '👮 SPRAWA KADROWA — ŻW' },
  skarga: { label: 'Skarga / odwołanie', emoji: '⚖️', color: ButtonStyle.Danger, title: '⚖️ SKARGA / ODWOŁANIE — ŻW' },
  inne: { label: 'Inna sprawa', emoji: '📁', color: ButtonStyle.Secondary, title: '📁 INNA SPRAWA — ŻW' }
};

function panel() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_type:pomoc').setLabel('Pomoc').setEmoji('🆘').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ticket_type:rekrutacja').setLabel('Rekrutacja').setEmoji('🎓').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ticket_type:kadry').setLabel('Kadry').setEmoji('👮').setStyle(ButtonStyle.Secondary)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_type:skarga').setLabel('Skarga / odwołanie').setEmoji('⚖️').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ticket_type:inne').setLabel('Inna sprawa').setEmoji('📁').setStyle(ButtonStyle.Secondary)
  );
  return {
    embeds: [new EmbedBuilder()
      .setTitle('🆘 CENTRUM POMOCY — ŻANDARMERIA WOJSKOWA')
      .setDescription('Wybierz temat zgłoszenia. Bot utworzy **prywatny ticket** widoczny dla Ciebie i uprawnionej kadry.')
      .addFields(
        { name: '🆘 Pomoc', value: 'Problem, pytanie lub pomoc techniczna.', inline: true },
        { name: '🎓 Rekrutacja', value: 'Sprawy dotyczące naboru i kandydata.', inline: true },
        { name: '👮 Kadry', value: 'Sprawy służbowe i personalne.', inline: true },
        { name: '⚖️ Skarga / odwołanie', value: 'Skarga, odwołanie lub sprawa wymagająca rozpatrzenia.', inline: true },
        { name: '📁 Inna sprawa', value: 'Temat, który nie pasuje do pozostałych kategorii.', inline: true }
      )],
    components: [row1, row2]
  };
}

function safeName(value) {
  return normalize(value).slice(0, 22) || 'uzytkownik';
}

function isStaff(member, staffRoleIds = []) {
  const P = PermissionsBitField.Flags;
  return !!member && (member.permissions.has(P.Administrator) || staffRoleIds.some(id => member.roles.cache.has(id)));
}

async function createTicket(interaction, kind, staffRoleIds = [], db = null, save = () => {}, log = async () => {}) {
  const type = TYPES[kind] || TYPES.inne;
  const category = getTicketCategory(interaction.guild);
  if (!category) {
    return interaction.reply({
      content: '❌ Nie znalazłem kategorii nadrzędnej kanału #kontakt. Umieść #kontakt w kategorii, w której mają być tickety.',
      ephemeral: true
    });
  }

  const topic = `ZW-TICKET:${kind}:${interaction.user.id}`;
  const existing = interaction.guild.channels.cache.find(c =>
    c.type === ChannelType.GuildText && c.topic === topic
  );
  if (existing) return interaction.reply({ content: `❌ Masz już otwarty ticket: ${existing}`, ephemeral: true });

  const P = PermissionsBitField.Flags;
  const overwrites = [
    { id: interaction.guild.roles.everyone.id, deny: [P.ViewChannel] },
    { id: interaction.user.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles] }
  ];
  for (const roleId of staffRoleIds) {
    overwrites.push({ id: roleId, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.ManageMessages] });
  }
  if (interaction.guild.members.me) {
    overwrites.push({ id: interaction.guild.members.me.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.ManageChannels] });
  }

  const channel = await interaction.guild.channels.create({
    name: `${kind}-${safeName(interaction.user.username)}`,
    type: ChannelType.GuildText,
    parent: category.id,
    topic,
    permissionOverwrites: overwrites
  });

  if (db) {
    db.tickets.push({ channelId: channel.id, userId: interaction.user.id, kind, status: 'OTWARTY', createdAt: new Date().toISOString() });
    save();
  }

  await channel.send({
    embeds: [new EmbedBuilder()
      .setTitle(type.title)
      .setDescription(`<@${interaction.user.id}> zgłosił(a) sprawę: **${type.label}**.\n\nOpisz dokładnie problem. Uprawniona kadra odpowie w tym kanale.`)
      .setFooter({ text: 'ŻW BOT • System ticketów' })
      .setTimestamp()],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_close').setLabel('Zamknij ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger)
    )]
  });

  await log(interaction.guild, '🎫 NOWY TICKET', `Typ: **${type.label}**\nUżytkownik: <@${interaction.user.id}>\nKanał: ${channel}`);
  return interaction.reply({ content: `✅ Utworzono ticket **${type.label}**: ${channel}`, ephemeral: true });
}

function closeButtonId(id) { return id === 'ticket_close' || id === 'close_ticket'; }

function ticketModal(kind) {
  const type = TYPES[kind] || TYPES.inne;
  return new ModalBuilder().setCustomId(`ticket_details:${kind}`).setTitle(`Ticket — ${type.label}`)
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('subject').setLabel('Temat sprawy').setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Opisz sprawę').setStyle(TextInputStyle.Paragraph).setMaxLength(1500).setRequired(true))
    );
}

module.exports = { TYPES, panel, ticketModal, createTicket, closeButtonId, isStaff, getTicketCategory };
