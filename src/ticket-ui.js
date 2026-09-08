const { ChannelType, PermissionsBitField, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const P = PermissionsBitField.Flags;
const staffRoles = String(process.env.STAFF_ROLE_IDS || '').split(',').map(x => x.trim()).filter(Boolean);

const TYPES = {
  pomoc: {
    label: 'Pomoc / pytanie',
    description: 'Problem, pytanie lub pomoc dotycząca serwera ŻW.',
    emoji: '🆘',
    prefix: 'pomoc'
  },
  rekrutacja: {
    label: 'Rekrutacja',
    description: 'Sprawa dotycząca podania, rekrutacji lub egzaminu.',
    emoji: '📋',
    prefix: 'rekrutacja'
  },
  kadry: {
    label: 'Sprawa kadrowa',
    description: 'Awanse, degrady, plusy, minusy, stopnie lub karta funkcjonariusza.',
    emoji: '👮',
    prefix: 'kadry'
  },
  skarga: {
    label: 'Skarga / odwołanie',
    description: 'Skarga, odwołanie albo sprawa wymagająca rozpatrzenia przez kadrę.',
    emoji: '⚠️',
    prefix: 'skarga'
  },
  inne: {
    label: 'Inna sprawa',
    description: 'Sprawa, która nie pasuje do pozostałych kategorii.',
    emoji: '📁',
    prefix: 'sprawa'
  }
};

function safeName(value) {
  return String(value || 'uzytkownik')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24) || 'uzytkownik';
}

function ticketTypeMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ticket_type_select')
      .setPlaceholder('Wybierz, czego dotyczy ticket')
      .addOptions(Object.entries(TYPES).map(([value, data]) => ({
        label: data.label,
        description: data.description,
        value,
        emoji: data.emoji
      })))
  );
}

async function handleTicket(interaction) {
  if (interaction.isButton() && interaction.customId === 'ticket_help') {
    return interaction.reply({
      content: '🎫 **Wybierz rodzaj sprawy**\nDzięki temu ticket trafi od razu do odpowiedniego rodzaju obsługi.',
      components: [ticketTypeMenu()],
      ephemeral: true
    });
  }

  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_type_select') {
    const kind = interaction.values[0];
    const data = TYPES[kind];
    if (!data) return interaction.reply({ content: '❌ Nieprawidłowy rodzaj ticketu.', ephemeral: true });

    const categoryId = process.env.TICKET_CATEGORY_ID;
    const category = interaction.guild.channels.cache.get(categoryId);
    if (!category || category.type !== ChannelType.GuildCategory) {
      return interaction.update({ content: '❌ Nie znaleziono kategorii ticketów. Umieść #kontakt w kategorii i uruchom bota ponownie.', components: [] });
    }

    const topic = `ZW-TICKET:${kind}:${interaction.user.id}`;
    const existing = interaction.guild.channels.cache.find(c =>
      c.type === ChannelType.GuildText && c.topic === topic
    );
    if (existing) {
      return interaction.update({ content: `❌ Masz już otwarty ticket tego typu: ${existing}`, components: [] });
    }

    const overwrites = [
      { id: interaction.guild.roles.everyone.id, deny: [P.ViewChannel] },
      { id: interaction.user.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory] }
    ];
    for (const roleId of staffRoles) {
      overwrites.push({ id: roleId, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.ManageMessages] });
    }
    if (interaction.guild.members.me) {
      overwrites.push({ id: interaction.guild.members.me.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.ManageChannels] });
    }

    const channel = await interaction.guild.channels.create({
      name: `${data.prefix}-${safeName(interaction.user.username)}`,
      type: ChannelType.GuildText,
      parent: category.id,
      topic,
      permissionOverwrites: overwrites
    });

    await channel.send({
      embeds: [new EmbedBuilder()
        .setTitle(`${data.emoji} ${data.label.toUpperCase()} — ŻW`)
        .setDescription([
          `<@${interaction.user.id}> ticket został utworzony.`,
          '',
          `**Rodzaj sprawy:** ${data.label}`,
          '**Co zrobić teraz?** Opisz dokładnie swoją sprawę. Jeśli dotyczy rekrutacji, kadry lub dokumentacji, podaj wszystkie potrzebne informacje.',
          '',
          '🔒 Ticket jest widoczny dla Ciebie oraz uprawnionej kadry.'
        ].join('\n'))
        .setTimestamp()],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('close_ticket').setLabel('Zamknij ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger)
      )]
    });

    return interaction.update({ content: `✅ Utworzono ticket **${data.label}**: ${channel}`, components: [] });
  }

  if (interaction.isButton() && interaction.customId === 'close_ticket') {
    const allowed = interaction.member.permissions.has(P.ManageChannels) ||
      interaction.member.permissions.has(P.Administrator) ||
      staffRoles.some(id => interaction.member.roles.cache.has(id));
    if (!allowed) return interaction.reply({ content: '❌ Tylko zgłaszający lub uprawniona kadra może zamknąć ticket.', ephemeral: true });

    await interaction.reply({ content: '🔒 Ticket zostanie zamknięty.', ephemeral: true });
    setTimeout(() => interaction.channel.delete('Zamknięcie ticketu ŻW').catch(() => {}), 1500);
    return true;
  }

  return false;
}

// Przechwytuje wyłącznie interakcje ticketowe, a resztę pozostawia istniejącemu systemowi ŻW.
const Client = require('discord.js').Client;
const originalOn = Client.prototype.on;
if (!Client.prototype.__zwTicketPatch) {
  Client.prototype.on = function(event, listener) {
    if (event === 'interactionCreate' && typeof listener === 'function') {
      return originalOn.call(this, event, async interaction => {
        const ticketHandled = await handleTicket(interaction).catch(error => {
          console.error('❌ Błąd systemu ticketów:', error);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ Wystąpił błąd podczas obsługi ticketu.', ephemeral: true }).catch(() => {});
          }
          return true;
        });
        if (!ticketHandled) return listener(interaction);
      });
    }
    return originalOn.call(this, event, listener);
  };
  Client.prototype.__zwTicketPatch = true;
}
