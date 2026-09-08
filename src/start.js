require('dotenv').config();

const { Client, ChannelType, PermissionsBitField, EmbedBuilder } = require('discord.js');
const ticketSystem = require('./ticket-system.js');

const { TOKEN, GUILD_ID } = process.env;
const staffRoleIds = String(process.env.STAFF_ROLE_IDS || '').split(',').map(x => x.trim()).filter(Boolean);

function normalize(value) {
  return String(value || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function findLogChannel(guild, names) {
  const wanted = names.map(normalize);
  return guild.channels.cache.find(c =>
    c.type === ChannelType.GuildText && wanted.includes(normalize(c.name))
  ) || null;
}

const LOG_CHANNELS = {
  wejscia: ['log-wejscia'],
  wyjscia: ['log-wyjscia'],
  role: ['log-rol'],
  kadrowy: ['log-kadrowy'],
  awanse: ['log-awansow'],
  degradacje: ['log-degradacji'],
  kary: ['log-kar'],
  podania: ['log-podan'],
  egzaminy: ['log-egzaminow'],
  tickety: ['log-ticketow'],
  administracja: ['log-administracji']
};

async function logEvent(guild, type, title, description) {
  const channel = findLogChannel(guild, LOG_CHANNELS[type] || LOG_CHANNELS.kadrowy);
  if (!channel) {
    console.warn(`⚠️ Nie znaleziono kanału logów: ${type}`);
    return false;
  }
  await channel.send({
    embeds: [new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setTimestamp()
      .setFooter({ text: 'ŻW BOT • System logów' })]
  }).catch(error => console.error(`❌ Nie można wysłać logu ${type}:`, error.message));
  return true;
}

async function discoverTicketCategory() {
  if (!TOKEN || !GUILD_ID) return null;
  const response = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/channels`, {
    headers: { Authorization: `Bot ${TOKEN}` }
  });
  if (!response.ok) throw new Error(`Nie udało się pobrać kanałów serwera Discord (HTTP ${response.status}).`);

  const channels = await response.json();
  const contact = channels.find(c => c.type === 0 && ['kontakt', 'pomoc'].includes(normalize(c.name)));
  if (contact?.parent_id) {
    const category = channels.find(c => c.id === contact.parent_id && c.type === 4);
    if (category) return category.id;
  }

  const categoryNames = ['tickety', 'ticket', 'pomoc', 'pomoc-tickety', 'pomoc-dla-obywateli'];
  const fallback = channels.find(c => c.type === 4 && categoryNames.includes(normalize(c.name)));
  return fallback?.id || null;
}

function isStaff(member) {
  const P = PermissionsBitField.Flags;
  return !!member && (member.permissions.has(P.Administrator) || staffRoleIds.some(id => member.roles.cache.has(id)));
}

function classifyCommand(name) {
  if (name === 'zw-awans') return ['awanse', '⬆️ AWANS — LOG', 'Zmiana kadrowa wykonana przez <@{by}>.'];
  if (name === 'zw-degradacja') return ['degradacje', '⬇️ DEGRADACJA — LOG', 'Zmiana kadrowa wykonana przez <@{by}>.'];
  if (name === 'zw-postepowanie') return ['kary', '⚠️ POSTĘPOWANIE — LOG', 'Postępowanie dodane przez <@{by}>.'];
  if (name === 'zw-plus' || name === 'zw-minus') return ['kadrowy', name === 'zw-plus' ? '➕ PLUS — LOG' : '➖ MINUS — LOG', 'Operacja punktowa wykonana przez <@{by}>.'];
  if (name === 'zw-raport' || name === 'zw-meldunek' || name === 'zw-rozkaz' || name === 'zw-sluzba') return ['kadrowy', `📋 ${name.toUpperCase()} — LOG`, 'Operacja wykonana przez <@{by}>.'];
  if (name === 'zw-wyroznienie' || name === 'zw-szkolenie' || name === 'zw-kwalifikacja') return ['kadrowy', `📋 ${name.toUpperCase()} — LOG`, 'Operacja wykonana przez <@{by}>.'];
  if (name === 'zw-egzamin-szkoleniowy' || name === 'zw-rekrutacja' || name === 'zw-egzamin-final') return ['egzaminy', `🎓 ${name.toUpperCase()} — LOG`, 'Operacja egzaminacyjna/rekrutacyjna wykonana przez <@{by}>.'];
  if (name === 'zw-panel' || name === 'zw-pomoc' || name === 'zw-zamknij') return ['administracja', `🛠️ ${name.toUpperCase()} — LOG`, 'Operacja administracyjna wykonana przez <@{by}>.'];
  return null;
}

async function handleTicketInteraction(interaction) {
  if (interaction.isButton() && interaction.customId === 'ticket_help') {
    const panel = ticketSystem.panel();
    await interaction.reply({ embeds: panel.embeds, components: panel.components, ephemeral: true });
    return true;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'zw-pomoc') {
    if (!isStaff(interaction.member)) {
      await interaction.reply({ content: '❌ Ta funkcja jest dostępna tylko dla kadry.', ephemeral: true });
      return true;
    }
    const channel = interaction.guild.channels.cache.find(c =>
      c.type === ChannelType.GuildText && ['kontakt', 'pomoc'].includes(normalize(c.name))
    );
    if (!channel) {
      await interaction.reply({ content: '❌ Nie znaleziono kanału #kontakt.', ephemeral: true });
      return true;
    }
    await channel.send(ticketSystem.panel());
    await logEvent(interaction.guild, 'administracja', '🆘 PANEL POMOCY', `<@${interaction.user.id}> opublikował panel ticketów w ${channel}.`);
    await interaction.reply({ content: '✅ Nowy panel ticketów został opublikowany w #kontakt.', ephemeral: true });
    return true;
  }

  if (!interaction.isButton() && !interaction.isModalSubmit()) return false;

  if (interaction.isButton() && interaction.customId.startsWith('ticket_type:')) {
    const kind = interaction.customId.split(':')[1];
    if (!ticketSystem.TYPES[kind]) return false;
    await interaction.showModal(ticketSystem.ticketModal(kind));
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket_details:')) {
    const kind = interaction.customId.split(':')[1];
    const subject = interaction.fields.getTextInputValue('subject');
    const description = interaction.fields.getTextInputValue('description');

    await ticketSystem.createTicket(
      interaction,
      kind,
      staffRoleIds,
      null,
      () => {},
      async (guild, title, text) => logEvent(guild, 'tickety', title, text)
    );

    const topic = `ZW-TICKET:${kind}:${interaction.user.id}`;
    const channel = interaction.guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.topic === topic);
    if (channel) {
      await channel.send({
        embeds: [new EmbedBuilder()
          .setTitle('📨 ZGŁOSZENIE')
          .addFields(
            { name: 'Temat', value: subject },
            { name: 'Opis', value: description }
          )
          .setTimestamp()]
      }).catch(() => {});
    }
    return true;
  }

  if (interaction.isButton() && ticketSystem.closeButtonId(interaction.customId)) {
    const channel = interaction.channel;
    if (!channel?.topic?.startsWith('ZW-TICKET:')) return false;

    const parts = channel.topic.split(':');
    const ownerId = parts[2];
    if (interaction.user.id !== ownerId && !isStaff(interaction.member)) {
      await interaction.reply({ content: '❌ Tylko autor ticketu lub uprawniona kadra może go zamknąć.', ephemeral: true });
      return true;
    }

    await logEvent(interaction.guild, 'tickety', '🔒 ZAMKNIĘCIE TICKETU', `Kanał: ${channel}\nUżytkownik: <@${ownerId}>\nZamknął: <@${interaction.user.id}>`);
    await interaction.reply({ content: '🔒 Ticket zostanie zamknięty.', ephemeral: true });
    setTimeout(() => channel.delete().catch(() => {}), 800);
    return true;
  }

  return false;
}

function installInteractionBridge() {
  const originalOn = Client.prototype.on;
  Client.prototype.on = function(event, listener) {
    if (event === 'interactionCreate') {
      const wrapped = async interaction => {
        try {
          if (interaction.isChatInputCommand()) {
            const classification = classifyCommand(interaction.commandName);
            if (classification) {
              const [type, title, text] = classification;
              await logEvent(interaction.guild, type, title, text.replace('{by}', interaction.user.id));
            }
          } else if (interaction.isModalSubmit() && interaction.customId === 'public_application') {
            await logEvent(interaction.guild, 'podania', '📋 NOWE PODANIE', `Nowe podanie publiczne złożył(a) <@${interaction.user.id}>.`);
          } else if (interaction.isButton() && interaction.customId === 'start_candidate') {
            await logEvent(interaction.guild, 'egzaminy', '🎓 REKRUTACJA KANDYDATA', `Kandydat <@${interaction.user.id}> rozpoczął etap rekrutacji.`);
          } else if (interaction.isButton() && interaction.customId === 'start_final') {
            await logEvent(interaction.guild, 'egzaminy', '🏁 EGZAMIN KOŃCOWY', `Kandydat <@${interaction.user.id}> rozpoczął egzamin końcowy.`);
          }

          if (await handleTicketInteraction(interaction)) return;
        } catch (error) {
          console.error('❌ Błąd systemu ticketów/logów:', error.message);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ Wystąpił błąd systemu.', ephemeral: true }).catch(() => {});
          }
          return;
        }
        return listener(interaction);
      };
      return originalOn.call(this, event, wrapped);
    }
    return originalOn.call(this, event, listener);
  };
}

(async () => {
  try {
    const categoryId = await discoverTicketCategory();
    if (!categoryId) {
      console.error('❌ Nie znaleziono kategorii nadrzędnej #kontakt. Umieść #kontakt w kategorii, w której mają powstawać tickety.');
      process.exit(1);
    }

    process.env.TICKET_CATEGORY_ID = categoryId;
    console.log(`🎫 Kategoria ticketów: ${categoryId} (wykryta z #kontakt)`);

    installInteractionBridge();
    require('./zw-system-v2.js');
  } catch (error) {
    console.error('❌ Nie udało się uruchomić systemu ŻW:', error.message);
    process.exit(1);
  }
})();
