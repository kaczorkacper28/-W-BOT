require('dotenv').config();

async function resolveTicketCategory() {
  const { TOKEN, GUILD_ID } = process.env;
  if (!TOKEN || !GUILD_ID) return;

  try {
    const response = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/channels`, {
      headers: { Authorization: `Bot ${TOKEN}` }
    });

    if (!response.ok) {
      console.warn(`⚠️ Nie udało się pobrać kanałów serwera: HTTP ${response.status}`);
      return;
    }

    const channels = await response.json();
    const normalize = value => String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');

    const contact = channels.find(channel =>
      channel.type === 0 && ['kontakt', 'pomoc'].includes(normalize(channel.name))
    );

    if (!contact) {
      console.warn('⚠️ Nie znaleziono istniejącego kanału #kontakt / #pomoc.');
      return;
    }

    if (!contact.parent_id) {
      console.warn('⚠️ #kontakt nie znajduje się w kategorii. Tickety wymagają istniejącej kategorii nadrzędnej.');
      return;
    }

    const category = channels.find(channel =>
      channel.id === contact.parent_id && channel.type === 4
    );

    if (!category) {
      console.warn('⚠️ Nie znaleziono kategorii nadrzędnej kanału #kontakt.');
      return;
    }

    process.env.TICKET_CATEGORY_ID = category.id;
    console.log(`🎫 Kategoria ticketów wykryta z #${contact.name}: ${category.name} (${category.id})`);
  } catch (error) {
    console.warn('⚠️ Nie udało się automatycznie wykryć kategorii ticketów:', error.message);
  }
}

resolveTicketCategory().finally(() => {
  require('./zw-system-v2.js');
});
