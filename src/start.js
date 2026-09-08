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

async function handleTicketInteraction(interaction) {
  // Stary przycisk z istniejącego panelu #kontakt otwiera teraz wybór konkretnej sprawy.
  if (interaction.isButton() && interaction.customId === 'ticket_help') {
    const panel = ticketSystem.panel();
    await interaction.reply({
      embeds: panel.embeds,
      components: panel.components,
      ephemeral: true
    });
    return true;
  }

  // /zw-pomoc publikuje pełny panel z wyborem rodzaju sprawy.
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

    await ticketSystem.createTicket(interaction, kind, staffRoleIds);
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
          if (await handleTicketInteraction(interaction)) return;
        } catch (error) {
          console.error('❌ Błąd systemu ticketów:', error.message);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ Wystąpił błąd systemu ticketów.', ephemeral: true }).catch(() => {});
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
