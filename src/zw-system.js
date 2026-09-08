require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const {
  Client, GatewayIntentBits, PermissionsBitField, ChannelType, REST, Routes,
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');

const { TOKEN, CLIENT_ID, GUILD_ID, STAFF_ROLE_IDS } = process.env;
if (!TOKEN || !CLIENT_ID || !GUILD_ID) throw new Error('Brak TOKEN, CLIENT_ID lub GUILD_ID w .env');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const P = PermissionsBitField.Flags;
const staffIds = (STAFF_ROLE_IDS || '').split(',').map(x => x.trim()).filter(Boolean);
const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'zw-service.json');
const DEFAULT = { nextNumber: 1, personnel: {}, reports: [], meldunki: [], rozkazy: [], trainings: [], trainingExams: [], exams: {}, actions: [], duty: {} };

function load() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT, null, 2));
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return { ...DEFAULT, ...parsed, personnel: parsed.personnel || {}, reports: parsed.reports || [], meldunki: parsed.meldunki || [], rozkazy: parsed.rozkazy || [], trainings: parsed.trainings || [], trainingExams: parsed.trainingExams || [], exams: parsed.exams || {}, actions: parsed.actions || [], duty: parsed.duty || {} };
  } catch { return structuredClone(DEFAULT); }
}
let db = load();
function save() { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }
const isStaff = m => !!m && (m.permissions.has(P.Administrator) || staffIds.some(id => m.roles.cache.has(id)));
const norm = s => String(s || '').toLowerCase().replace(/[📋📜📡⬆️⬇️⚠️🏅📁🎓📝📊🪖👮➕➖]/gu, '').replace(/[^a-ząćęłńóśźż0-9-]/g, '').replace(/-/g, '');
function findChannel(guild, names) { const wanted = names.map(norm); return guild.channels.cache.find(c => c.type === ChannelType.GuildText && wanted.includes(norm(c.name))) || null; }
async function post(guild, names, payload) { const ch = findChannel(guild, names); if (!ch) return null; return ch.send(payload).catch(() => null); }
function personnel(userId) { return db.personnel[userId] || null; }
function ensurePersonnel(user) {
  if (!db.personnel[user.id]) {
    db.personnel[user.id] = { userId: user.id, username: user.username, number: `ŻW-${String(db.nextNumber++).padStart(4, '0')}`, rank: 'Kandydat', points: 0, reprimands: 0, qualifications: [], trainings: [], history: [], joinedAt: new Date().toISOString() };
    save();
  }
  return db.personnel[user.id];
}
function logAction(type, targetId, actorId, details) { db.actions.push({ type, targetId, actorId, details, at: new Date().toISOString() }); save(); }
function modal(id, title, fields) {
  const m = new ModalBuilder().setCustomId(id).setTitle(title);
  m.addComponents(...fields.map(f => new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(f[0]).setLabel(f[1]).setStyle(f[2] || TextInputStyle.Paragraph).setRequired(true).setMaxLength(f[3] || 1000).setPlaceholder(f[4] || 'Wpisz dane...'))));
  return m;
}

const rankChoices = ['Kandydat','Szeregowy','Starszy szeregowy','Kapral','Plutonowy','Sierżant','Starszy sierżant','Chorąży','Podporucznik','Porucznik','Kapitan','Major','Podpułkownik','Pułkownik','Generał brygady','Generał dywizji','Generał broni'].map(x => ({ name: x, value: x }));
const commands = [
  new SlashCommandBuilder().setName('zw-panel').setDescription('Publikuje panel rekrutacyjny ŻW w istniejącym kanale.'),
  new SlashCommandBuilder().setName('zw-zamknij').setDescription('Zamyka aktualny ticket rekrutacyjny.'),
  new SlashCommandBuilder().setName('zw-podania').setDescription('Pokazuje statystyki podań.'),
  new SlashCommandBuilder().setName('zw-egzaminy').setDescription('Pokazuje statystyki egzaminów.'),
  new SlashCommandBuilder().setName('zw-raport').setDescription('Złóż raport służbowy.'),
  new SlashCommandBuilder().setName('zw-meldunek').setDescription('Złóż meldunek służbowy.'),
  new SlashCommandBuilder().setName('zw-rozkaz').setDescription('Dodaj rozkaz.').addStringOption(o => o.setName('tytul').setDescription('Tytuł rozkazu').setRequired(true)).addStringOption(o => o.setName('tresc').setDescription('Treść rozkazu').setRequired(true)),
  new SlashCommandBuilder().setName('zw-plus').setDescription('Przyznaj plus funkcjonariuszowi.').addUserOption(o => o.setName('osoba').setDescription('Funkcjonariusz').setRequired(true)).addIntegerOption(o => o.setName('punkty').setDescription('Liczba punktów').setMinValue(1).setMaxValue(100).setRequired(true)).addStringOption(o => o.setName('powod').setDescription('Powód').setRequired(true)),
  new SlashCommandBuilder().setName('zw-minus').setDescription('Przyznaj minus funkcjonariuszowi.').addUserOption(o => o.setName('osoba').setDescription('Funkcjonariusz').setRequired(true)).addIntegerOption(o => o.setName('punkty').setDescription('Liczba punktów').setMinValue(1).setMaxValue(100).setRequired(true)).addStringOption(o => o.setName('powod').setDescription('Powód').setRequired(true)),
  new SlashCommandBuilder().setName('zw-awans').setDescription('Awansuj funkcjonariusza.').addUserOption(o => o.setName('osoba').setDescription('Funkcjonariusz').setRequired(true)).addStringOption(o => o.setName('stopien').setDescription('Nowy stopień').setRequired(true).addChoices(...rankChoices)).addStringOption(o => o.setName('powod').setDescription('Powód').setRequired(true)),
  new SlashCommandBuilder().setName('zw-degradacja').setDescription('Degraduj funkcjonariusza.').addUserOption(o => o.setName('osoba').setDescription('Funkcjonariusz').setRequired(true)).addStringOption(o => o.setName('stopien').setDescription('Nowy stopień').setRequired(true).addChoices(...rankChoices)).addStringOption(o => o.setName('powod').setDescription('Powód').setRequired(true)),
  new SlashCommandBuilder().setName('zw-wyroznienie').setDescription('Dodaj wyróżnienie.').addUserOption(o => o.setName('osoba').setDescription('Funkcjonariusz').setRequired(true)).addStringOption(o => o.setName('opis').setDescription('Opis wyróżnienia').setRequired(true)),
  new SlashCommandBuilder().setName('zw-postepowanie').setDescription('Dodaj postępowanie dyscyplinarne.').addUserOption(o => o.setName('osoba').setDescription('Funkcjonariusz').setRequired(true)).addStringOption(o => o.setName('opis').setDescription('Opis postępowania').setRequired(true)),
  new SlashCommandBuilder().setName('zw-funkcjonariusz').setDescription('Pokaż kartę funkcjonariusza.').addUserOption(o => o.setName('osoba').setDescription('Osoba').setRequired(false)),
  new SlashCommandBuilder().setName('zw-szkolenie').setDescription('Dodaj szkolenie funkcjonariusza.').addUserOption(o => o.setName('osoba').setDescription('Funkcjonariusz').setRequired(true)).addStringOption(o => o.setName('nazwa').setDescription('Nazwa szkolenia').setRequired(true)).addStringOption(o => o.setName('wynik').setDescription('Wynik').setRequired(true)),
  new SlashCommandBuilder().setName('zw-kwalifikacja').setDescription('Dodaj kwalifikację.').addUserOption(o => o.setName('osoba').setDescription('Funkcjonariusz').setRequired(true)).addStringOption(o => o.setName('nazwa').setDescription('Kwalifikacja').setRequired(true)).addStringOption(o => o.setName('status').setDescription('Status').setRequired(true)),
  new SlashCommandBuilder().setName('zw-egzamin-szkolenie').setDescription('Zapisz wynik egzaminu szkoleniowego.').addUserOption(o => o.setName('osoba').setDescription('Funkcjonariusz').setRequired(true)).addStringOption(o => o.setName('nazwa').setDescription('Egzamin').setRequired(true)).addIntegerOption(o => o.setName('procent').setDescription('Wynik procentowy').setMinValue(0).setMaxValue(100).setRequired(true)),
  new SlashCommandBuilder().setName('zw-sluzba').setDescription('Rozpocznij lub zakończ służbę.').addStringOption(o => o.setName('akcja').setDescription('Akcja').setRequired(true).addChoices({ name: 'rozpocznij', value: 'start' }, { name: 'zakończ', value: 'stop' })).addStringOption(o => o.setName('notatka').setDescription('Notatka').setRequired(false)),
  new SlashCommandBuilder().setName('zw-statystyki').setDescription('Pokaż statystyki systemu ŻW.')
].map(x => x.toJSON());

function recruitmentPanel() {
  return { embeds: [new EmbedBuilder().setColor(0x1f2937).setTitle('🇵🇱 ŻANDARMERIA WOJSKOWA — REKRUTACJA').setDescription('🎓 **ZŁÓŻ PODANIE** — otwiera prywatny ticket rekrutacyjny.\n\n📝 **EGZAMIN** — otwiera prywatny ticket egzaminacyjny.\n\n🔒 Ticket widzi kandydat i uprawniona kadra.')], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('new_app').setLabel('Złóż podanie').setEmoji('🎓').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('new_exam').setLabel('Egzamin').setEmoji('📝').setStyle(ButtonStyle.Success))] };
}
function ticketCategory(guild) { return guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && norm(c.name).includes('rekrutacjakandydat')) || null; }
async function createTicket(i, type) {
  const cat = ticketCategory(i.guild);
  if (!cat) return i.reply({ content: '❌ Nie znaleziono kategorii REKRUTACJA — KANDYDAT. Bot nie tworzy kategorii.', ephemeral: true });
  const topic = `ZW-TICKET:${type}:${i.user.id}`;
  const existing = i.guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.topic === topic);
  if (existing) return i.reply({ content: `❌ Masz już ticket: ${existing}`, ephemeral: true });
  const ow = [{ id: i.guild.roles.everyone.id, deny: [P.ViewChannel] }, { id: i.user.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory] }];
  for (const id of staffIds) ow.push({ id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.ManageMessages] });
  if (i.guild.members.me) ow.push({ id: i.guild.members.me.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.ManageChannels, P.ManageMessages] });
  const safe = i.user.username.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40) || 'kandydat';
  const ch = await i.guild.channels.create({ name: `${type === 'exam' ? 'egzamin' : 'podanie'}-${safe}`, type: ChannelType.GuildText, parent: cat.id, topic, permissionOverwrites: ow });
  await i.reply({ content: `✅ Ticket utworzony: ${ch}`, ephemeral: true });
  if (type === 'application') {
    const m = modal(`app:${ch.id}`, 'Podanie do Żandarmerii Wojskowej', [['wiek','Wiek RP',TextInputStyle.Short,3],['dane','Imię i nazwisko RP',TextInputStyle.Short,100],['exp','Doświadczenie',TextInputStyle.Paragraph,1000],['mot','Motywacja',TextInputStyle.Paragraph,1000],['czas','Dyspozycyjność',TextInputStyle.Paragraph,1000]]);
    return i.followUp({ content: '📋 Otwieram formularz podania.', ephemeral: true }).then(() => i.showModal(m));
  }
  await ch.send({ content: `<@${i.user.id}>`, embeds: [new EmbedBuilder().setColor(0x22c55e).setTitle('🎓 EGZAMIN ŻW').setDescription('10 pytań • minimum 70% • odpowiedzi są zapisywane automatycznie.')], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('exam_start').setLabel('Rozpocznij egzamin').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('close').setLabel('Zamknij').setStyle(ButtonStyle.Danger))] });
}

const questions = [
  ['Jaki jest podstawowy cel Żandarmerii Wojskowej?',['Przestrzeganie dyscypliny wojskowej','Prowadzenie sportu','Administracja cywilna','Kontrola lotnicza'],0],
  ['Jak powinien wyglądać meldunek?',['Chaotycznie','Krótko, jasno i rzeczowo','Tylko emotikony','Bez danych'],1],
  ['Jak należy wykonywać zgodne z regulaminem polecenia przełożonego?',['Ignorować','Wykonać zgodnie z zasadami służby','Publikować','Przekazać przypadkowej osobie'],1],
  ['Co oznacza RP?',['Real Play','RolePlay','Rapid Patrol','Regulamin Personalny'],1],
  ['Jak zachować się podczas kontroli RP?',['Prowokować','Kulturalnie i zgodnie z procedurą','Uciekać','Spamować'],1],
  ['Czy informacje kadrowe przekazuje się osobom nieuprawnionym?',['Tak','Nie','Zawsze','Tylko poza Discordem'],1],
  ['Co zrobić, gdy potrzebne jest wsparcie?',['Ukryć sytuację','Wezwać wsparcie i złożyć meldunek','Opuścić służbę','Usunąć dokumentację'],1],
  ['Czym jest dyscyplina służbowa?',['Brakiem odpowiedzialności','Przestrzeganiem regulaminów i poleceń','Tylko mundurem','Dowolnością'],1],
  ['Jak należy zachować się podczas egzaminu?',['Korzystać z podpowiedzi','Odpowiadać samodzielnie','Spamować','Ignorować pytania'],1],
  ['Co powinien zawierać dobry raport?',['Same emotikony','Datę, miejsce, przebieg i istotne informacje','Losowe dane','Nic'],1]
];
function startExam(i) { db.exams[i.user.id] = { userId: i.user.id, channelId: i.channel.id, q: 0, score: 0, status: 'W_TRAKCIE', startedAt: new Date().toISOString() }; save(); return sendQuestion(i.channel, i.user.id, 0); }
async function sendQuestion(ch, uid, n) { const q = questions[n]; const row = new ActionRowBuilder(); q[1].forEach((a,k) => row.addComponents(new ButtonBuilder().setCustomId(`examans:${k}`).setLabel(`${String.fromCharCode(65+k)}. ${a}`.slice(0,80)).setStyle(ButtonStyle.Secondary))); return ch.send({ content: `<@${uid}>`, embeds: [new EmbedBuilder().setColor(0x22c55e).setTitle(`📝 EGZAMIN ŻW • ${n+1}/${questions.length}`).setDescription(q[0])], components: [row] }); }
async function answerExam(i, idx) {
  const e = db.exams[i.user.id];
  if (!e || e.channelId !== i.channel.id || e.status !== 'W_TRAKCIE') return i.reply({ content: '❌ Brak aktywnego egzaminu.', ephemeral: true });
  const q = questions[e.q]; e.score += idx === q[2] ? 1 : 0; e.q++;
  if (e.q >= questions.length) {
    e.status = 'ZAKOŃCZONY'; e.percent = Math.round(e.score / questions.length * 100); e.result = e.percent >= 70 ? 'ZDAŁ' : 'NIE ZDAŁ'; e.finishedAt = new Date().toISOString(); save();
    await i.update({ embeds: [new EmbedBuilder().setColor(e.result === 'ZDAŁ' ? 0x22c55e : 0xef4444).setTitle('🎓 EGZAMIN ZAKOŃCZONY').setDescription(`Wynik: **${e.score}/${questions.length} (${e.percent}%)**\nMinimum: **70%**\nRezultat: **${e.result}**`)], content: '', components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close').setLabel('Zamknij').setStyle(ButtonStyle.Secondary))] });
    await post(i.guild, ['wyniki-egzaminow','wyniki-egzaminów'], `🎓 <@${i.user.id}> — **${e.score}/${questions.length} (${e.percent}%)** — **${e.result}**`); return;
  }
  save(); await i.update({ content: '✅ Odpowiedź zapisana.', embeds: [], components: [] }); setTimeout(() => sendQuestion(i.channel, i.user.id, e.q), 350);
}

async function handleModal(i) {
  const [kind, id] = i.customId.split(':');
  const data = Object.fromEntries(i.fields.fields.map(f => [f.customId, f.value]));
  if (kind === 'app') {
    db.reports.push({ type: 'PODANIE', userId: i.user.id, channelId: id, data, at: new Date().toISOString() }); save();
    await i.reply({ content: '✅ Podanie zostało zapisane. Kadra rozpatrzy je w tickecie.', ephemeral: true });
    await post(i.guild, ['podania-wewnetrzne','podania-wewnętrzne'], { embeds: [new EmbedBuilder().setColor(0x3b82f6).setTitle('📋 NOWE PODANIE ŻW').setDescription(`Kandydat: <@${i.user.id}>\nWiek: ${data.wiek}\nDane RP: ${data.dane}\nDoświadczenie: ${data.exp}\nMotywacja: ${data.mot}\nDyspozycyjność: ${data.czas}`).setTimestamp()] }); return;
  }
  if (kind === 'raport') {
    db.reports.push({ userId: i.user.id, data, at: new Date().toISOString() }); save();
    await post(i.guild, ['raporty','raporty-sluzbowe','raporty-służbowe'], { embeds: [new EmbedBuilder().setColor(0x2563eb).setTitle('📋 RAPORT SŁUŻBOWY').setDescription(`Funkcjonariusz: <@${i.user.id}>\nData: ${data.data}\nMiejsce: ${data.miejsce}\nPrzebieg: ${data.przebieg}\nUwagi: ${data.uwagi}`).setTimestamp()] });
    return i.reply({ content: '✅ Raport zapisany i przekazany do właściwego kanału.', ephemeral: true });
  }
  if (kind === 'meldunek') {
    db.meldunki.push({ userId: i.user.id, data, at: new Date().toISOString() }); save();
    await post(i.guild, ['meldunki','meldunki-sluzbowe','meldunki-służbowe'], { embeds: [new EmbedBuilder().setColor(0xf59e0b).setTitle('📡 MELDUNEK').setDescription(`Funkcjonariusz: <@${i.user.id}>\nRodzaj: ${data.rodzaj}\nTreść: ${data.tresc}`).setTimestamp()] });
    return i.reply({ content: '✅ Meldunek zapisany.', ephemeral: true });
  }
}

client.once('ready', async () => {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  console.log(`ŻW BOT online: ${client.user.tag}`);
});

client.on('interactionCreate', async i => {
  try {
    if (i.isChatInputCommand()) {
      const n = i.commandName;
      if (n === 'zw-panel') { if (!isStaff(i.member)) return i.reply({ content: '❌ Tylko kadra może publikować panel.', ephemeral: true }); const ch = findChannel(i.guild, ['panel-podania']); if (!ch) return i.reply({ content: '❌ Nie znaleziono panel-podania.', ephemeral: true }); await ch.send(recruitmentPanel()); return i.reply({ content: '✅ Panel opublikowany.', ephemeral: true }); }
      if (n === 'zw-zamknij') { if (!i.channel.topic?.startsWith('ZW-TICKET:')) return i.reply({ content: '❌ To nie jest ticket ŻW.', ephemeral: true }); if (!isStaff(i.member) && !i.channel.topic.endsWith(`:${i.user.id}`)) return i.reply({ content: '❌ Brak uprawnień.', ephemeral: true }); await i.reply('🔒 Ticket zostanie zamknięty.'); return setTimeout(() => i.channel.delete().catch(() => {}), 1200); }
      if (n === 'zw-podania') return i.reply({ content: `📋 Podań zapisanych: **${db.reports.filter(x => x.type === 'PODANIE').length}**`, ephemeral: true });
      if (n === 'zw-egzaminy') return i.reply({ content: `🎓 Egzaminy rekrutacyjne: **${Object.keys(db.exams).length}**\nEgzaminy szkoleniowe: **${db.trainingExams.length}**`, ephemeral: true });
      if (n === 'zw-raport') return i.showModal(modal('raport','Raport służbowy',[['data','Data / godzina',TextInputStyle.Short,100],['miejsce','Miejsce',TextInputStyle.Short,200],['przebieg','Przebieg służby',TextInputStyle.Paragraph,1000],['uwagi','Uwagi',TextInputStyle.Paragraph,1000]]));
      if (n === 'zw-meldunek') return i.showModal(modal('meldunek','Meldunek służbowy',[['rodzaj','Rodzaj meldunku',TextInputStyle.Short,100],['tresc','Treść meldunku',TextInputStyle.Paragraph,1500]]));
      if (n === 'zw-rozkaz') { if (!isStaff(i.member)) return i.reply({ content: '❌ Tylko kadra.', ephemeral: true }); const x = { title: i.options.getString('tytul'), tresc: i.options.getString('tresc'), actorId: i.user.id, at: new Date().toISOString() }; db.rozkazy.push(x); logAction('ROZKAZ', null, i.user.id, x.title); await post(i.guild, ['rozkazy','rozkazy-dowodztwa','rozkazy-dowództwa'], { embeds: [new EmbedBuilder().setColor(0x7c3aed).setTitle(`📜 ROZKAZ — ${x.title}`).setDescription(x.tresc).setFooter({ text: `Wystawił: ${i.user.tag}` }).setTimestamp()] }); return i.reply({ content: '✅ Rozkaz zapisany.', ephemeral: true }); }
      if (['zw-plus','zw-minus','zw-awans','zw-degradacja','zw-wyroznienie','zw-postepowanie','zw-szkolenie','zw-kwalifikacja','zw-egzamin-szkolenie'].includes(n)) {
        if (!isStaff(i.member)) return i.reply({ content: '❌ Tylko kadra może wykonać tę operację.', ephemeral: true });
        const u = i.options.getUser('osoba'); const p = ensurePersonnel(u);
        if (n === 'zw-plus' || n === 'zw-minus') { const pts = i.options.getInteger('punkty'); const delta = n === 'zw-plus' ? pts : -pts; const reason = i.options.getString('powod'); p.points += delta; p.history.push({ type: n === 'zw-plus' ? 'PLUS' : 'MINUS', points: delta, reason, by: i.user.id, at: new Date().toISOString() }); save(); logAction(n.toUpperCase().slice(3), u.id, i.user.id, `${delta} pkt: ${reason}`); await post(i.guild, [n === 'zw-plus' ? 'plusy' : 'minusy'], `**${n === 'zw-plus' ? '➕ PLUS' : '➖ MINUS'}** — <@${u.id}> **${delta > 0 ? '+' : ''}${delta}** pkt\nPowód: ${reason}\nKadra: <@${i.user.id}>`); return i.reply({ content: `✅ Zaktualizowano punkty. Stan: **${p.points}**`, ephemeral: true }); }
        if (n === 'zw-awans' || n === 'zw-degradacja') { const old = p.rank; p.rank = i.options.getString('stopien'); const reason = i.options.getString('powod'); p.history.push({ type: n === 'zw-awans' ? 'AWANS' : 'DEGRADACJA', from: old, to: p.rank, reason, by: i.user.id, at: new Date().toISOString() }); save(); logAction(n.toUpperCase().slice(3), u.id, i.user.id, `${old} -> ${p.rank}: ${reason}`); await post(i.guild, [n === 'zw-awans' ? 'awanse' : 'degradacje'], { embeds: [new EmbedBuilder().setColor(n === 'zw-awans' ? 0x22c55e : 0xef4444).setTitle(n === 'zw-awans' ? '⬆️ AWANS' : '⬇️ DEGRADACJA').setDescription(`<@${u.id}>\n**${old}** → **${p.rank}**\nPowód: ${reason}\nDecyzja: <@${i.user.id}>`).setTimestamp()] }); return i.reply({ content: '✅ Operacja kadrowa zapisana.', ephemeral: true }); }
        if (n === 'zw-wyroznienie') { const x = i.options.getString('opis'); p.history.push({ type: 'WYRÓŻNIENIE', opis: x, by: i.user.id, at: new Date().toISOString() }); save(); logAction('WYRÓŻNIENIE', u.id, i.user.id, x); await post(i.guild, ['wyroznienia','wyróżnienia'], `🏅 **WYRÓŻNIENIE** — <@${u.id}>\n${x}\nNadano: <@${i.user.id}>`); return i.reply({ content: '✅ Wyróżnienie zapisane.', ephemeral: true }); }
        if (n === 'zw-postepowanie') { const x = i.options.getString('opis'); p.reprimands++; p.history.push({ type: 'POSTĘPOWANIE', opis: x, by: i.user.id, at: new Date().toISOString() }); save(); logAction('POSTĘPOWANIE', u.id, i.user.id, x); await post(i.guild, ['postepowania','postępowania'], `⚠️ **POSTĘPOWANIE** — <@${u.id}>\n${x}\nProwadzący: <@${i.user.id}>`); return i.reply({ content: '✅ Postępowanie zapisane.', ephemeral: true }); }
        if (n === 'zw-szkolenie') { const x = { nazwa: i.options.getString('nazwa'), wynik: i.options.getString('wynik'), by: i.user.id, at: new Date().toISOString() }; p.trainings.push(x); db.trainings.push({ userId: u.id, ...x }); save(); logAction('SZKOLENIE', u.id, i.user.id, x.nazwa); await post(i.guild, ['szkolenia'], `🎓 **SZKOLENIE** — <@${u.id}>\n${x.nazwa}\nWynik: ${x.wynik}\nProwadzący: <@${i.user.id}>`); return i.reply({ content: '✅ Szkolenie zapisane.', ephemeral: true }); }
        if (n === 'zw-kwalifikacja') { const x = { nazwa: i.options.getString('nazwa'), status: i.options.getString('status'), by: i.user.id, at: new Date().toISOString() }; p.qualifications.push(x); save(); logAction('KWALIFIKACJA', u.id, i.user.id, `${x.nazwa}: ${x.status}`); await post(i.guild, ['kwalifikacje'], `📋 **KWALIFIKACJA** — <@${u.id}>\n${x.nazwa} — **${x.status}**`); return i.reply({ content: '✅ Kwalifikacja zapisana.', ephemeral: true }); }
        if (n === 'zw-egzamin-szkolenie') { const percent = i.options.getInteger('procent'); const x = { userId: u.id, nazwa: i.options.getString('nazwa'), percent, result: percent >= 70 ? 'ZDAŁ' : 'NIE ZDAŁ', by: i.user.id, at: new Date().toISOString() }; db.trainingExams.push(x); save(); logAction('EGZAMIN_SZKOLENIOWY', u.id, i.user.id, `${x.nazwa}: ${percent}%`); await post(i.guild, ['wyniki-egzaminow','wyniki-egzaminów'], `📝 **EGZAMIN SZKOLENIOWY** — <@${u.id}>\n${x.nazwa}: **${percent}% — ${x.result}**`); return i.reply({ content: '✅ Wynik egzaminu zapisany.', ephemeral: true }); }
      }
      if (n === 'zw-funkcjonariusz') { const u = i.options.getUser('osoba') || i.user; const p = personnel(u.id) || ensurePersonnel(u); const hist = p.history.slice(-8).map(x => `${x.type}: ${x.reason || x.opis || x.to || ''}`).join('\n') || 'Brak'; return i.reply({ embeds: [new EmbedBuilder().setColor(0x334155).setTitle('🪖 KARTA FUNKCJONARIUSZA').setDescription(`Osoba: <@${u.id}>\nNumer: **${p.number}**\nStopień: **${p.rank}**\nPunkty: **${p.points}**\nNagany/postępowania: **${p.reprimands}**\nKwalifikacje: **${p.qualifications.length}**\nSzkolenia: **${p.trainings.length}**\n\n**Ostatnia historia:**\n${hist}`).setTimestamp()], ephemeral: true }); }
      if (n === 'zw-sluzba') { const a = i.options.getString('akcja'); const note = i.options.getString('notatka') || ''; const now = new Date().toISOString(); db.duty[i.user.id] = a === 'start' ? { start: now, note } : { ...(db.duty[i.user.id] || {}), stop: now, stopNote: note }; save(); return i.reply({ content: a === 'start' ? '🟢 Służba rozpoczęta.' : '🔴 Służba zakończona.', ephemeral: true }); }
      if (n === 'zw-statystyki') return i.reply({ embeds: [new EmbedBuilder().setTitle('📊 STATYSTYKI ŻW').setDescription(`Funkcjonariusze: **${Object.keys(db.personnel).length}**\nRaporty: **${db.reports.length}**\nMeldunki: **${db.meldunki.length}**\nRozkazy: **${db.rozkazy.length}**\nOperacje kadrowe: **${db.actions.length}**\nSzkolenia: **${db.trainings.length}**\nEgzaminy rekrutacyjne: **${Object.keys(db.exams).length}**\nEgzaminy szkoleniowe: **${db.trainingExams.length}**`).setTimestamp()] });
    }
    if (i.isButton()) {
      if (i.customId === 'new_app') return createTicket(i, 'application');
      if (i.customId === 'new_exam') return createTicket(i, 'exam');
      if (i.customId === 'exam_start') return startExam(i);
      if (i.customId === 'close') { if (!i.channel.topic?.startsWith('ZW-TICKET:')) return i.reply({ content: '❌ To nie jest ticket.', ephemeral: true }); if (!isStaff(i.member) && !i.channel.topic.endsWith(`:${i.user.id}`)) return i.reply({ content: '❌ Brak uprawnień.', ephemeral: true }); await i.reply('🔒 Zamykam ticket...'); return setTimeout(() => i.channel.delete().catch(() => {}), 1000); }
      if (i.customId.startsWith('examans:')) return answerExam(i, Number(i.customId.split(':')[1]));
    }
    if (i.isModalSubmit()) return handleModal(i);
  } catch (e) {
    console.error(e);
    if (!i.replied && !i.deferred) await i.reply({ content: '❌ Wystąpił błąd systemu ŻW.', ephemeral: true }).catch(() => {});
  }
});

client.login(TOKEN);
