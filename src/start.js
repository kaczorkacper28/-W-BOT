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

  // ZAWSZE używamy kategorii nadrzędnej istniejącego kanału #kontakt.
  // TICKET_CATEGORY_ID z .env nie ma pierwszeństwa, dzięki czemu stary/błędny ID
  // nie blokuje systemu ticketów.
  const normalize = value => String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

  const contact = channels.find(c =>
    c.type === 0 && ['kontakt', 'pomoc'].includes(normalize(c.name))
  );

  if (contact?.parent_id) {
    const category = channels.find(c => c.id === contact.parent_id && c.type === 4);
    if (category) return category.id;
  }

  // Fallback tylko do już istniejącej kategorii — bot niczego nie tworzy.
  const categoryNames = ['tickety', 'ticket', 'pomoc', 'pomoc-tickety', 'pomoc-dla-obywateli'];
  const fallback = channels.find(c => c.type === 4 && categoryNames.includes(normalize(c.name)));
  return fallback?.id || null;
}

(async () => {
  try {
    const categoryId = await discoverTicketCategory();
    if (!categoryId) {
      console.error('❌ Nie znaleziono kategorii nadrzędnej istniejącego #kontakt. Umieść #kontakt w kategorii, w której mają powstawać tickety.');
      process.exit(1);
    }

    // Nadpisujemy nawet stary TICKET_CATEGORY_ID z Rendera.
    process.env.TICKET_CATEGORY_ID = categoryId;
    console.log(`🎫 Kategoria ticketów: ${categoryId} (wykryta automatycznie z #kontakt)`);

    require('./zw-system-v2.js');
  } catch (error) {
    console.error('❌ Nie udało się uruchomić systemu ŻW:', error.message);
    process.exit(1);
  }
})();
