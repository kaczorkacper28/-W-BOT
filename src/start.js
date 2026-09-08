require('dotenv').config();

const { TOKEN, GUILD_ID } = process.env;

async function discoverTicketCategory() {
  if (!TOKEN || !GUILD_ID) return null;

  const response = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/channels`, {
    headers: { Authorization: `Bot ${TOKEN}` }
  });

  if (!response.ok) {
    throw new Error(`Nie udało się pobrać kanałów serwera Discord (HTTP ${response.status}).`);
  }

  const channels = await response.json();

  // Jeśli podano TICKET_CATEGORY_ID i faktycznie wskazuje kategorię, zachowujemy ją.
  if (process.env.TICKET_CATEGORY_ID) {
    const configured = channels.find(c => c.id === process.env.TICKET_CATEGORY_ID);
    if (configured?.type === 4) return configured.id;
  }

  // Główne źródło: istniejący kanał #kontakt. Bot używa kategorii nadrzędnej tego kanału.
  const contact = channels.find(c => {
    if (c.type !== 0) return false;
    const name = String(c.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return name.includes('kontakt');
  });

  if (contact?.parent_id) return contact.parent_id;

  // Dodatkowe bezpieczne nazwy istniejących kategorii, bez tworzenia nowych kanałów.
  const categoryNames = ['tickety', 'ticket', 'pomoc', 'pomoc-tickety', 'pomoc-dla-obywateli'];
  const fallback = channels.find(c => c.type === 4 && categoryNames.includes(String(c.name || '').toLowerCase()));
  return fallback?.id || null;
}

(async () => {
  try {
    const categoryId = await discoverTicketCategory();
    if (!categoryId) {
      console.error('❌ Nie znaleziono kategorii nadrzędnej istniejącego #kontakt. Umieść #kontakt w kategorii, w której mają powstawać tickety.');
      process.exit(1);
    }

    process.env.TICKET_CATEGORY_ID = categoryId;
    console.log(`🎫 Kategoria ticketów: ${categoryId} (wykryta automatycznie z #kontakt)`);

    require('./zw-system-v2.js');
  } catch (error) {
    console.error('❌ Nie udało się uruchomić systemu ŻW:', error.message);
    process.exit(1);
  }
})();
