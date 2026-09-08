require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const {
  Client, GatewayIntentBits, PermissionsBitField, ChannelType, REST, Routes,
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');

const {
  TOKEN, CLIENT_ID, GUILD_ID,
  STAFF_ROLE_IDS = '',
  CANDIDATE_ROLE_ID = '',
  TICKET_CATEGORY_ID = '',
  LOG_CHANNEL_ID = ''
} = process.env;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) throw new Error('Brak TOKEN, CLIENT_ID lub GUILD_ID w .env');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const P = PermissionsBitField.Flags;
const staffRoles = STAFF_ROLE_IDS.split(',').map(x => x.trim()).filter(Boolean);
const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'zw-data.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

const EMPTY = {
  nextNumber: 1,
  personnel: {},
  applications: [],
  candidateTests: {},
  finalTests: {},
  reports: [],
  meldunki: [],
  orders: [],
  promotions: [],
  demotions: [],
  pluses: [],
  minuses: [],
  proceedings: [],
  awards: [],
  trainings: [],
  trainingExams: [],
  materials: [],
  qualifications: [],
  duty: {},
  tickets: []
};

let db = { ...EMPTY };
try {
  const loaded = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  db = { ...EMPTY, ...loaded };
} catch (_) {}
for (const key of Object.keys(EMPTY)) if (db[key] === undefined) db[key] = EMPTY[key];
const save = () => fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));

const normalize = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
const isStaff = member => !!member && (member.permissions.has(P.Administrator) || staffRoles.some(id => member.roles.cache.has(id)));
const staffOnly = async i => {
  if (isStaff(i.member)) return true;
  if (!i.replied && !i.deferred) await i.reply({ content: '❌ Ta funkcja jest dostępna tylko dla kadry.', ephemeral: true });
  return false;
};

const RANKS = [
  'Kandydat', 'Szeregowy', 'Starszy szeregowy', 'Kapral', 'Plutonowy', 'Sierżant',
  'Starszy sierżant', 'Starszy chorąży', 'Podporucznik', 'Porucznik', 'Kapitan',
  'Major', 'Podpułkownik', 'Pułkownik', 'Generał brygady', 'Generał dywizji', 'Generał broni'
];

const QUESTIONS = {
  candidate: [
    ['Co jest podstawą prawidłowej służby w RP?', ['Dyscyplina i regulamin', 'Samowola', 'Brak komunikacji', 'Dowolność'], 0],
    ['Jak powinien wyglądać meldunek?', ['Krótko, jasno i rzeczowo', 'Chaotycznie', 'Tylko emoji', 'Bez danych'], 0],
    ['Jak prowadzisz łączność?', ['Rzeczowo i zwięźle', 'Spamem', 'Krzykiem', 'Bez identyfikacji'], 0],
    ['Co robisz po otrzymaniu polecenia?', ['Wykonujesz je zgodnie z regulaminem RP', 'Ignorujesz', 'Publikujesz je publicznie', 'Usuwasz'], 0],
    ['Co powinien zawierać raport?', ['Datę, miejsce, przebieg i najważniejsze informacje', 'Same emoji', 'Losowe informacje', 'Nic'], 0],
    ['Co robisz, gdy potrzebujesz wsparcia?', ['Przekazujesz meldunek i prosisz o wsparcie', 'Uciekasz', 'Spamujesz', 'Nic'], 0],
    ['Jak zachować się wobec przełożonego?', ['Kulturalnie i zgodnie z hierarchią RP', 'Lekceważąco', 'Agresywnie', 'Ignorować'], 0],
    ['Co robisz po popełnieniu błędu?', ['Informujesz przełożonego i korygujesz działanie', 'Ukrywasz', 'Usuwasz logi', 'Ignorujesz'], 0],
    ['Kiedy przechodzisz do egzaminu końcowego?', ['Po zaliczeniu rekrutacji kandydata', 'Przed podaniem', 'Od razu', 'Nigdy'], 0],
    ['Jak powinien zachować się kandydat podczas rekrutacji?', ['Samodzielnie, spokojnie i uczciwie', 'Korzystać z podpowiedzi', 'Spamować', 'Ignorować komisję'], 0]
  ],
  final: [
    ['Co powinien zrobić funkcjonariusz po zakończeniu służby?', ['Zamknąć służbę i uzupełnić wymaganą dokumentację', 'Nic', 'Usunąć raport', 'Zostawić status'], 0],
    ['Co jest najważniejsze w dobrym meldunku?', ['Kto, co, gdzie i kiedy', 'Tylko imię', 'Tylko godzina', 'Emoji'], 0],
    ['Co robisz z informacją służbową przeznaczoną dla kadry?', ['Przekazujesz ją osobom uprawnionym', 'Publikujesz publicznie', 'Wysyłasz losowej osobie', 'Usuwasz'], 0],
    ['Co robisz, gdy rozkaz jest niejasny?', ['Prosisz przełożonego o doprecyzowanie', 'Zgadujesz', 'Ignorujesz', 'Publikujesz'], 0],
    ['Jak dokumentujesz czynność?', ['Rzetelnie i zgodnie ze stanem RP', 'Zmyślasz', 'Pomijasz wszystko', 'Usuwasz'], 0],
    ['Jak reagujesz na prowokację?', ['Zachowujesz profesjonalizm i kontrolę', 'Eskalujesz', 'Obrażasz', 'Kończysz służbę'], 0],
    ['Kto dokonuje zmian kadrowych?', ['Uprawniona kadra', 'Każdy użytkownik', 'Kandydat', 'Bot bez kontroli'], 0],
    ['Dlaczego prowadzi się szkolenia?', ['Aby podnosić przygotowanie do służby RP', 'Nie mają znaczenia', 'Tylko dla wyglądu', 'Zastępują służbę'], 0],
    ['Co jest podstawą współpracy w patrolu?', ['Komunikacja i podział obowiązków', 'Samowola', 'Brak łączności', 'Rywalizacja'], 0],
    ['Jaki jest cel egzaminu końcowego?', ['Potwierdzenie przygotowania kandydata do służby RP', 'Losowanie stopnia', 'Zabawa', 'Nadanie stopnia każdemu'], 0]
  ]
};

function personnel(user) {
  if (!db.personnel[user.id]) {
    db.personnel[user.id] = {
      userId: user.id,
      number: `ZW-${String(db.nextNumber++).padStart(4, '0')}`,
      rank: 'Kandydat', plus: 0, minus: 0, reprimands: 0,
      awards: [], trainings: [], qualifications: [], history: [], dutyMs: 0,
      createdAt: new Date().toISOString()
    };
    save();
  }
  return db.personnel[user.id];
}

function findTextChannel(guild, names) {
  const wanted = names.map(normalize);
  return guild.channels.cache.find(c => c.type === ChannelType.GuildText && wanted.includes(normalize(c.name)));
}

async function logTo(guild, title, description, channelNames = []) {
  let channel = null;
  if (LOG_CHANNEL_ID) channel = guild.channels.cache.get(LOG_CHANNEL_ID) || null;
  if (!channel && channelNames.length) channel = findTextChannel(guild, channelNames);
  if (!channel) return;
  await channel.send({ embeds: [new EmbedBuilder().setTitle(title).setDescription(description).setTimestamp()] }).catch(() => {});
}

function publicPanel() {
  return {
    embeds: [new EmbedBuilder().setTitle('📋 PODANIE PUBLICZNE — ŻANDARMERIA WOJSKOWA').setDescription(
      'Jesteś osobą z ulicy i chcesz rozpocząć rekrutację do ŻW RP? Kliknij przycisk i wypełnij podstawowe podanie. Po pozytywnej decyzji kadry otrzymasz status kandydata i przejdziesz do kolejnego etapu.'
    )],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('apply_public').setLabel('Złóż podanie').setEmoji('📋').setStyle(ButtonStyle.Primary)
    )]
  };
}

function candidatePanel() {
  return {
    embeds: [new EmbedBuilder().setTitle('🎓 REKRUTACJA KANDYDATA ŻW').setDescription(
      'Ten etap jest dostępny dla osób, których podanie publiczne zostało zaakceptowane. Odpowiedz na pytania samodzielnie. Próg zaliczenia: **70%**. Po zaliczeniu odblokowuje się egzamin końcowy.'
    )],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('start_candidate').setLabel('Rozpocznij rekrutację').setStyle(ButtonStyle.Success)
    )]
  };
}

function finalPanel() {
  return {
    embeds: [new EmbedBuilder().setTitle('🏁 EGZAMIN KOŃCOWY KANDYDATA ŻW').setDescription(
      'Egzamin końcowy jest ostatnim etapem rekrutacji RP. Próg zaliczenia: **70%**. Przy niezaliczeniu możliwe jest ponowne podejście.'
    )],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('start_final').setLabel('Rozpocznij egzamin końcowy').setStyle(ButtonStyle.Success)
    )]
  };
}

function helpPanel() {
  return {
    embeds: [new EmbedBuilder().setTitle('🆘 POMOC — ŻW').setDescription('Masz problem lub pytanie? Otwórz prywatny ticket. Widzi go zgłaszający oraz uprawniona kadra.')],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_help').setLabel('Potrzebuję pomocy').setEmoji('🆘').setStyle(ButtonStyle.Primary)
    )]
  };
}

function publicModal() {
  const fields = [
    ['name', 'Imię i nazwisko RP', TextInputStyle.Short, 100],
    ['age', 'Wiek RP', TextInputStyle.Short, 3],
    ['experience', 'Doświadczenie RP', TextInputStyle.Paragraph, 1000],
    ['motivation', 'Dlaczego chcesz do ŻW?', TextInputStyle.Paragraph, 1000],
    ['availability', 'Dyspozycyjność', TextInputStyle.Paragraph, 500]
  ];
  return new ModalBuilder().setCustomId('public_application').setTitle('Podanie publiczne ŻW').addComponents(
    ...fields.map(([id, label, style, max]) => new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setMaxLength(max).setRequired(true)
    ))
  );
}

function safeName(s) { return normalize(s).slice(0, 28) || 'uzytkownik'; }

async function createTicket(interaction, kind = 'pomoc') {
  if (!TICKET_CATEGORY_ID) return interaction.reply({ content: '❌ Brak TICKET_CATEGORY_ID w .env.', ephemeral: true });
  const category = interaction.guild.channels.cache.get(TICKET_CATEGORY_ID);
  if (!category || category.type !== ChannelType.GuildCategory) return interaction.reply({ content: '❌ TICKET_CATEGORY_ID wskazuje na nieprawidłową kategorię.', ephemeral: true });
  const topic = `ZW-TICKET:${kind}:${interaction.user.id}`;
  const existing = interaction.guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.topic === topic);
  if (existing) return interaction.reply({ content: `❌ Masz już otwarty ticket: ${existing}`, ephemeral: true });
  const overwrites = [
    { id: interaction.guild.roles.everyone.id, deny: [P.ViewChannel] },
    { id: interaction.user.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory] }
  ];
  for (const roleId of staffRoles) overwrites.push({ id: roleId, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.ManageMessages] });
  if (interaction.guild.members.me) overwrites.push({ id: interaction.guild.members.me.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.ManageChannels] });
  const channel = await interaction.guild.channels.create({
    name: `${kind}-${safeName(interaction.user.username)}`,
    type: ChannelType.GuildText,
    parent: category.id,
    topic,
    permissionOverwrites: overwrites
  });
  db.tickets.push({ channelId: channel.id, userId: interaction.user.id, kind, status: 'OTWARTY', createdAt: new Date().toISOString() });
  save();
  await channel.send({ embeds: [new EmbedBuilder().setTitle(kind === 'pomoc' ? '🆘 TICKET POMOCY' : '📋 TICKET REKRUTACYJNY').setDescription(`<@${interaction.user.id}> opisz swoją sprawę. Uprawniona kadra odpowie tutaj.`)], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_ticket').setLabel('Zamknij ticket').setStyle(ButtonStyle.Danger))] });
  await interaction.reply({ content: `✅ Ticket utworzony: ${channel}`, ephemeral: true });
}

async function postQuestion(interaction, stage, index) {
  const questions = QUESTIONS[stage];
  const q = questions[index];
  const row = new ActionRowBuilder();
  q[1].forEach((answer, n) => row.addComponents(new ButtonBuilder().setCustomId(`answer:${stage}:${index}:${n}`).setLabel(`${String.fromCharCode(65 + n)}. ${answer}`.slice(0, 80)).setStyle(ButtonStyle.Secondary)));
  await interaction.channel.send({ embeds: [new EmbedBuilder().setTitle(stage === 'candidate' ? `🎓 PYTANIE ${index + 1}/${questions.length}` : `🏁 PYTANIE ${index + 1}/${questions.length}`).setDescription(q[0])], components: [row] });
}

async function startTest(interaction, stage) {
  const p = personnel(interaction.user);
  if (stage === 'candidate') {
    if (CANDIDATE_ROLE_ID && !interaction.member.roles.cache.has(CANDIDATE_ROLE_ID)) return interaction.reply({ content: '❌ Musisz mieć rolę kandydata ŻW.', ephemeral: true });
  } else {
    const previous = db.candidateTests[interaction.user.id];
    if (!previous?.passed) return interaction.reply({ content: '❌ Najpierw musisz zaliczyć rekrutację kandydata.', ephemeral: true });
  }
  const store = stage === 'candidate' ? db.candidateTests : db.finalTests;
  const previous = store[interaction.user.id];
  store[interaction.user.id] = {
    userId: interaction.user.id, channelId: interaction.channel.id, index: 0, score: 0,
    attempts: (previous?.attempts || 0) + 1, status: 'W_TRAKCIE', startedAt: new Date().toISOString(), number: p.number
  };
  save();
  await interaction.reply({ content: '✅ Rozpoczynasz etap rekrutacji.', ephemeral: true });
  await postQuestion(interaction, stage, 0);
}

async function answerTest(interaction, stage, index, answer) {
  const store = stage === 'candidate' ? db.candidateTests : db.finalTests;
  const test = store[interaction.user.id];
  const questions = QUESTIONS[stage];
  if (!test || test.channelId !== interaction.channel.id || test.index !== index) return interaction.reply({ content: '❌ To pytanie jest nieaktualne.', ephemeral: true });
  if (Number(answer) === questions[index][2]) test.score++;
  test.index++;
  save();
  await interaction.update({ components: [] });
  if (test.index >= questions.length) {
    const percent = Math.round((test.score / questions.length) * 100);
    test.percent = percent;
    test.status = percent >= 70 ? 'ZALICZONY' : 'NIEZALICZONY';
    test.passed = percent >= 70;
    test.finishedAt = new Date().toISOString();
    save();
    await logTo(interaction.guild, stage === 'candidate' ? '🎓 WYNIK REKRUTACJI KANDYDATA' : '🏁 WYNIK EGZAMINU KOŃCOWEGO', `<@${interaction.user.id}>\nWynik: **${percent}%**\nStatus: **${test.status}**\nPodejście: **${test.attempts}**`, ['wyniki-rekrutacji', 'wyniki-egzaminow']);
    return interaction.channel.send({ embeds: [new EmbedBuilder().setTitle(stage === 'candidate' ? '🎓 REKRUTACJA ZAKOŃCZONA' : '🏁 EGZAMIN ZAKOŃCZONY').setDescription(`Wynik: **${percent}%**\nStatus: **${test.status}**\n${test.passed ? (stage === 'candidate' ? 'Możesz przejść do egzaminu końcowego.' : 'Proces rekrutacyjny zakończony wynikiem pozytywnym.') : 'Możesz ponownie podejść do tego etapu.'}`)] });
  }
  await postQuestion(interaction, stage, test.index);
}

async function handleCommand(i) {
  const name = i.commandName;
  const guild = i.guild;
  if (name === 'zw-panel') {
    if (!await staffOnly(i)) return;
    const channel = findTextChannel(guild, ['panel-podania']);
    if (!channel) return i.reply({ content: '❌ Nie znaleziono kanału panel-podania.', ephemeral: true });
    await channel.send(publicPanel());
    const contact = findTextChannel(guild, ['kontakt', 'pomoc']);
    if (contact) await contact.send(helpPanel());
    return i.reply({ content: '✅ Opublikowano panel podania publicznego i panel pomocy.', ephemeral: true });
  }
  if (name === 'zw-rekrutacja') {
    if (!await staffOnly(i)) return;
    const channel = findTextChannel(guild, ['podania-wewnetrzne', 'podanie-kandydat']);
    if (!channel) return i.reply({ content: '❌ Nie znaleziono kanału rekrutacji kandydata.', ephemeral: true });
    await channel.send(candidatePanel());
    return i.reply({ content: '✅ Panel rekrutacji kandydata opublikowany.', ephemeral: true });
  }
  if (name === 'zw-egzamin-final') {
    if (!await staffOnly(i)) return;
    const channel = findTextChannel(guild, ['egzamin-kandydata', 'egzamin-finalowy']);
    if (!channel) return i.reply({ content: '❌ Nie znaleziono kanału egzaminu końcowego.', ephemeral: true });
    await channel.send(finalPanel());
    return i.reply({ content: '✅ Panel egzaminu końcowego opublikowany.', ephemeral: true });
  }
  if (name === 'zw-pomoc') {
    if (!await staffOnly(i)) return;
    const channel = findTextChannel(guild, ['kontakt', 'pomoc']);
    if (!channel) return i.reply({ content: '❌ Nie znaleziono kanału kontakt/pomoc.', ephemeral: true });
    await channel.send(helpPanel());
    return i.reply({ content: '✅ Panel pomocy opublikowany.', ephemeral: true });
  }
  if (name === 'zw-raport' || name === 'zw-meldunek') {
    const text = i.options.getString('tresc');
    const key = name === 'zw-raport' ? 'reports' : 'meldunki';
    db[key].push({ userId: i.user.id, text, createdAt: new Date().toISOString() });
    save();
    await logTo(guild, name === 'zw-raport' ? '📄 RAPORT SŁUŻBOWY' : '📝 MELDUNEK', `Autor: <@${i.user.id}>\n${text}`, name === 'zw-raport' ? ['raporty', 'raporty-sluzbowe'] : ['meldunki']);
    return i.reply({ content: name === 'zw-raport' ? '✅ Raport zapisany.' : '✅ Meldunek zapisany.', ephemeral: true });
  }
  if (name === 'zw-rozkaz') {
    if (!await staffOnly(i)) return;
    const title = i.options.getString('tytul'), text = i.options.getString('tresc');
    db.orders.push({ title, text, by: i.user.id, createdAt: new Date().toISOString() });
    save();
    await logTo(guild, `📜 ROZKAZ — ${title}`, text, ['rozkazy']);
    return i.reply({ content: '✅ Rozkaz zapisany.', ephemeral: true });
  }
  if (['zw-plus', 'zw-minus'].includes(name)) {
    if (!await staffOnly(i)) return;
    const user = i.options.getUser('osoba'), points = i.options.getInteger('punkty'), reason = i.options.getString('powod');
    const p = personnel(user); p[name === 'zw-plus' ? 'plus' : 'minus'] += points;
    p.history.push({ type: name === 'zw-plus' ? 'PLUS' : 'MINUS', points, reason, by: i.user.id, at: new Date().toISOString() });
    db[name === 'zw-plus' ? 'pluses' : 'minuses'].push({ userId: user.id, points, reason, by: i.user.id, createdAt: new Date().toISOString() });
    save();
    await logTo(guild, name === 'zw-plus' ? '➕ PLUS' : '➖ MINUS', `<@${user.id}>\nPunkty: **${points}**\nPowód: ${reason}\nNadał: <@${i.user.id}>`, name === 'zw-plus' ? ['plusy', 'wyroznienia'] : ['minusy', 'sprawy-kadrowe']);
    return i.reply({ content: '✅ Zapisano.', ephemeral: true });
  }
  if (name === 'zw-awans' || name === 'zw-degradacja') {
    if (!await staffOnly(i)) return;
    const user = i.options.getUser('osoba'), rank = i.options.getString('stopien'), reason = i.options.getString('powod');
    const p = personnel(user), old = p.rank; p.rank = rank;
    p.history.push({ type: name === 'zw-awans' ? 'AWANS' : 'DEGRADACJA', from: old, to: rank, reason, by: i.user.id, at: new Date().toISOString() });
    db[name === 'zw-awans' ? 'promotions' : 'demotions'].push({ userId: user.id, from: old, to: rank, reason, by: i.user.id, createdAt: new Date().toISOString() });
    save();
    await logTo(guild, name === 'zw-awans' ? '⬆️ AWANS' : '⬇️ DEGRADACJA', `<@${user.id}>\n**${old} → ${rank}**\nPowód: ${reason}\nDecyzja: <@${i.user.id}>`, name === 'zw-awans' ? ['awanse'] : ['degradacje']);
    return i.reply({ content: `✅ Zmieniono stopień: ${old} → ${rank}.`, ephemeral: true });
  }
  if (name === 'zw-postepowanie' || name === 'zw-wyroznienie') {
    if (!await staffOnly(i)) return;
    const user = i.options.getUser('osoba'), description = i.options.getString('opis'), p = personnel(user);
    if (name === 'zw-postepowanie') { p.reprimands++; db.proceedings.push({ userId: user.id, description, by: i.user.id, createdAt: new Date().toISOString() }); }
    else { p.awards.push(description); db.awards.push({ userId: user.id, description, by: i.user.id, createdAt: new Date().toISOString() }); }
    p.history.push({ type: name, description, by: i.user.id, at: new Date().toISOString() }); save();
    await logTo(guild, name === 'zw-postepowanie' ? '⚠️ POSTĘPOWANIE' : '🏅 WYRÓŻNIENIE', `<@${user.id}>\n${description}\nNadał: <@${i.user.id}>`, name === 'zw-postepowanie' ? ['postepowania'] : ['wyroznienia']);
    return i.reply({ content: '✅ Zapisano.', ephemeral: true });
  }
  if (name === 'zw-szkolenie' || name === 'zw-kwalifikacja') {
    if (!await staffOnly(i)) return;
    const user = i.options.getUser('osoba'), title = i.options.getString('nazwa'), result = i.options.getString('wynik') || i.options.getString('status');
    const p = personnel(user);
    if (name === 'zw-szkolenie') { p.trainings.push({ title, result }); db.trainings.push({ userId: user.id, title, result, by: i.user.id, createdAt: new Date().toISOString() }); }
    else { p.qualifications.push({ title, result }); db.qualifications.push({ userId: user.id, title, result, by: i.user.id, createdAt: new Date().toISOString() }); }
    save();
    await logTo(guild, name === 'zw-szkolenie' ? '🎓 SZKOLENIE' : '📋 KWALIFIKACJA', `<@${user.id}>\n**${title}**\n${result}`, name === 'zw-szkolenie' ? ['szkolenia'] : ['kwalifikacje']);
    return i.reply({ content: '✅ Zapisano.', ephemeral: true });
  }
  if (name === 'zw-egzamin-szkoleniowy') {
    if (!await staffOnly(i)) return;
    const user = i.options.getUser('osoba'), title = i.options.getString('nazwa'), percent = i.options.getInteger('procent');
    const status = percent >= 70 ? 'ZALICZONY' : 'NIEZALICZONY';
    db.trainingExams.push({ userId: user.id, title, percent, status, by: i.user.id, createdAt: new Date().toISOString() }); save();
    await logTo(guild, '📊 EGZAMIN SZKOLENIOWY', `<@${user.id}>\n**${title}**\nWynik: **${percent}%** — ${status}`, ['wyniki-egzaminow']);
    return i.reply({ content: `✅ Zapisano wynik: ${percent}% — ${status}.`, ephemeral: true });
  }
  if (name === 'zw-funkcjonariusz') {
    const user = i.options.getUser('osoba') || i.user, p = personnel(user);
    return i.reply({ embeds: [new EmbedBuilder().setTitle('🪖 KARTA FUNKCJONARIUSZA ŻW').setDescription(
      `<@${user.id}>\nNumer: **${p.number}**\nStopień: **${p.rank}**\n➕ Plusy: **${p.plus}**\n➖ Minusy: **${p.minus}**\n⚠️ Postępowania: **${p.reprimands}**\n🎓 Szkolenia: **${p.trainings.length}**\n📋 Kwalifikacje: **${p.qualifications.length}**`
    )], ephemeral: true });
  }
  if (name === 'zw-sluzba') {
    const action = i.options.getString('akcja'), p = personnel(i.user);
    if (action === 'start') {
      if (db.duty[i.user.id]) return i.reply({ content: '⚠️ Już jesteś w służbie.', ephemeral: true });
      db.duty[i.user.id] = Date.now();
      save(); await logTo(guild, '🟢 ROZPOCZĘCIE SŁUŻBY', `<@${i.user.id}> rozpoczął służbę.`, ['raporty', 'grafik-sluzby']);
      return i.reply({ content: '🟢 Służba rozpoczęta.', ephemeral: true });
    }
    if (!db.duty[i.user.id]) return i.reply({ content: '⚠️ Nie jesteś w służbie.', ephemeral: true });
    p.dutyMs += Date.now() - db.duty[i.user.id]; delete db.duty[i.user.id]; save();
    await logTo(guild, '🔴 ZAKOŃCZENIE SŁUŻBY', `<@${i.user.id}> zakończył służbę.`, ['raporty', 'grafik-sluzby']);
    return i.reply({ content: '🔴 Służba zakończona.', ephemeral: true });
  }
  if (name === 'zw-statystyki') {
    if (!await staffOnly(i)) return;
    return i.reply({ content: `👮 Funkcjonariusze: **${Object.keys(db.personnel).length}**\n📋 Podania: **${db.applications.length}**\n🎓 Rekrutacje: **${Object.keys(db.candidateTests).length}**\n🏁 Egzaminy końcowe: **${Object.keys(db.finalTests).length}**\n📄 Raporty: **${db.reports.length}**\n📝 Meldunki: **${db.meldunki.length}**\n📜 Rozkazy: **${db.orders.length}**\n🎓 Szkolenia: **${db.trainings.length}**\n🆘 Tickety: **${db.tickets.length}**`, ephemeral: true });
  }
  if (name === 'zw-zamknij') {
    if (!await staffOnly(i)) return;
    if (!i.channel || !i.channel.topic?.startsWith('ZW-TICKET:')) return i.reply({ content: '❌ To nie jest ticket ŻW.', ephemeral: true });
    const ticket = db.tickets.find(x => x.channelId === i.channel.id);
    if (ticket) { ticket.status = 'ZAMKNIĘTY'; ticket.closedBy = i.user.id; ticket.closedAt = new Date().toISOString(); save(); }
    await i.reply({ content: '🔒 Zamykam ticket.', ephemeral: true });
    return i.channel.delete().catch(() => {});
  }
}

const cmd = (name, description) => new SlashCommandBuilder().setName(name).setDescription(description);
const commands = [
  cmd('zw-panel', 'Publikuje panel podania publicznego i pomocy'),
  cmd('zw-rekrutacja', 'Publikuje panel rekrutacji kandydata'),
  cmd('zw-egzamin-final', 'Publikuje panel egzaminu końcowego'),
  cmd('zw-pomoc', 'Publikuje panel pomocy i ticketów'),
  cmd('zw-zamknij', 'Zamyka ticket ŻW'),
  cmd('zw-raport', 'Dodaje raport służbowy').addStringOption(o => o.setName('tresc').setDescription('Treść raportu').setRequired(true)),
  cmd('zw-meldunek', 'Dodaje meldunek').addStringOption(o => o.setName('tresc').setDescription('Treść meldunku').setRequired(true)),
  cmd('zw-rozkaz', 'Dodaje rozkaz').addStringOption(o => o.setName('tytul').setDescription('Tytuł').setRequired(true)).addStringOption(o => o.setName('tresc').setDescription('Treść').setRequired(true)),
  cmd('zw-plus', 'Nadaje plus').addUserOption(o => o.setName('osoba').setDescription('Osoba').setRequired(true)).addIntegerOption(o => o.setName('punkty').setDescription('Punkty').setMinValue(1).setMaxValue(100).setRequired(true)).addStringOption(o => o.setName('powod').setDescription('Powód').setRequired(true)),
  cmd('zw-minus', 'Nadaje minus').addUserOption(o => o.setName('osoba').setDescription('Osoba').setRequired(true)).addIntegerOption(o => o.setName('punkty').setDescription('Punkty').setMinValue(1).setMaxValue(100).setRequired(true)).addStringOption(o => o.setName('powod').setDescription('Powód').setRequired(true)),
  cmd('zw-awans', 'Nadaje awans').addUserOption(o => o.setName('osoba').setDescription('Osoba').setRequired(true)).addStringOption(o => o.setName('stopien').setDescription('Nowy stopień').setRequired(true).addChoices(...RANKS.map(x => ({ name: x, value: x })))).addStringOption(o => o.setName('powod').setDescription('Powód').setRequired(true)),
  cmd('zw-degradacja', 'Nadaje degradację').addUserOption(o => o.setName('osoba').setDescription('Osoba').setRequired(true)).addStringOption(o => o.setName('stopien').setDescription('Nowy stopień').setRequired(true).addChoices(...RANKS.map(x => ({ name: x, value: x })))).addStringOption(o => o.setName('powod').setDescription('Powód').setRequired(true)),
  cmd('zw-postepowanie', 'Dodaje postępowanie').addUserOption(o => o.setName('osoba').setDescription('Osoba').setRequired(true)).addStringOption(o => o.setName('opis').setDescription('Opis').setRequired(true)),
  cmd('zw-wyroznienie', 'Dodaje wyróżnienie').addUserOption(o => o.setName('osoba').setDescription('Osoba').setRequired(true)).addStringOption(o => o.setName('opis').setDescription('Opis').setRequired(true)),
  cmd('zw-szkolenie', 'Dodaje szkolenie').addUserOption(o => o.setName('osoba').setDescription('Osoba').setRequired(true)).addStringOption(o => o.setName('nazwa').setDescription('Nazwa szkolenia').setRequired(true)).addStringOption(o => o.setName('wynik').setDescription('Wynik/status').setRequired(true)),
  cmd('zw-kwalifikacja', 'Dodaje kwalifikację').addUserOption(o => o.setName('osoba').setDescription('Osoba').setRequired(true)).addStringOption(o => o.setName('nazwa').setDescription('Nazwa').setRequired(true)).addStringOption(o => o.setName('status').setDescription('Status').setRequired(true)),
  cmd('zw-egzamin-szkoleniowy', 'Zapisuje wynik egzaminu szkoleniowego').addUserOption(o => o.setName('osoba').setDescription('Osoba').setRequired(true)).addStringOption(o => o.setName('nazwa').setDescription('Nazwa').setRequired(true)).addIntegerOption(o => o.setName('procent').setDescription('Wynik procentowy').setMinValue(0).setMaxValue(100).setRequired(true)),
  cmd('zw-funkcjonariusz', 'Pokazuje kartę funkcjonariusza').addUserOption(o => o.setName('osoba').setDescription('Osoba').setRequired(false)),
  cmd('zw-sluzba', 'Rozpoczyna lub kończy służbę').addStringOption(o => o.setName('akcja').setDescription('Akcja').setRequired(true).addChoices({ name: 'Rozpocznij', value: 'start' }, { name: 'Zakończ', value: 'stop' })),
  cmd('zw-statystyki', 'Pokazuje statystyki systemu')
].map(x => x.toJSON());

client.once('ready', async () => {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  console.log(`🇵🇱 ŻW BOT ONLINE: ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isChatInputCommand()) return handleCommand(interaction);
    if (interaction.isButton()) {
      if (interaction.customId === 'apply_public') return interaction.showModal(publicModal());
      if (interaction.customId === 'ticket_help') return createTicket(interaction, 'pomoc');
      if (interaction.customId === 'start_candidate') return startTest(interaction, 'candidate');
      if (interaction.customId === 'start_final') return startTest(interaction, 'final');
      if (interaction.customId === 'close_ticket') {
        if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ Tylko kadra może zamknąć ticket.', ephemeral: true });
        const ticket = db.tickets.find(x => x.channelId === interaction.channel.id);
        if (ticket) { ticket.status = 'ZAMKNIĘTY'; ticket.closedBy = interaction.user.id; ticket.closedAt = new Date().toISOString(); save(); }
        await interaction.reply({ content: '🔒 Zamykam ticket.', ephemeral: true });
        return interaction.channel.delete().catch(() => {});
      }
      if (interaction.customId.startsWith('answer:')) {
        const [, stage, index, answer] = interaction.customId.split(':');
        return answerTest(interaction, stage, Number(index), Number(answer));
      }
      if (['application_accept', 'application_reject'].includes(interaction.customId)) {
        if (!await staffOnly(interaction)) return;
        const app = db.applications.find(x => x.channelId === interaction.channel.id && x.status === 'OCZEKUJE');
        if (!app) return interaction.reply({ content: '❌ Nie znaleziono oczekującego podania.', ephemeral: true });
        app.status = interaction.customId === 'application_accept' ? 'PRZYJĘTE' : 'ODRZUCONE';
        app.decidedBy = interaction.user.id; app.decidedAt = new Date().toISOString();
        if (app.status === 'PRZYJĘTE') {
          const member = await interaction.guild.members.fetch(app.userId).catch(() => null);
          if (CANDIDATE_ROLE_ID && member) await member.roles.add(CANDIDATE_ROLE_ID).catch(() => {});
          personnel(await interaction.client.users.fetch(app.userId));
        }
        save();
        await interaction.reply({ content: app.status === 'PRZYJĘTE' ? '✅ Podanie przyjęte. Kandydat otrzymał status.' : '❌ Podanie odrzucone.', ephemeral: true });
      }
    }
    if (interaction.isModalSubmit() && interaction.customId === 'public_application') {
      const category = TICKET_CATEGORY_ID ? interaction.guild.channels.cache.get(TICKET_CATEGORY_ID) : null;
      if (!category || category.type !== ChannelType.GuildCategory) return interaction.reply({ content: '❌ Brak poprawnego TICKET_CATEGORY_ID w .env.', ephemeral: true });
      const existing = interaction.guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.topic === `ZW-APPLICATION:${interaction.user.id}` && db.applications.some(a => a.channelId === c.id && a.status === 'OCZEKUJE'));
      if (existing) return interaction.reply({ content: `❌ Masz już oczekujące podanie: ${existing}`, ephemeral: true });
      const overwrites = [
        { id: interaction.guild.roles.everyone.id, deny: [P.ViewChannel] },
        { id: interaction.user.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory] }
      ];
      for (const roleId of staffRoles) overwrites.push({ id: roleId, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.ManageMessages] });
      if (interaction.guild.members.me) overwrites.push({ id: interaction.guild.members.me.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.ManageChannels] });
      const channel = await interaction.guild.channels.create({ name: `podanie-${safeName(interaction.user.username)}`, type: ChannelType.GuildText, parent: category.id, topic: `ZW-APPLICATION:${interaction.user.id}`, permissionOverwrites: overwrites });
      const data = {
        userId: interaction.user.id,
        channelId: channel.id,
        status: 'OCZEKUJE',
        name: interaction.fields.getTextInputValue('name'),
        age: interaction.fields.getTextInputValue('age'),
        experience: interaction.fields.getTextInputValue('experience'),
        motivation: interaction.fields.getTextInputValue('motivation'),
        availability: interaction.fields.getTextInputValue('availability'),
        createdAt: new Date().toISOString()
      };
      db.applications.push(data); save();
      await channel.send({ embeds: [new EmbedBuilder().setTitle('📋 NOWE PODANIE PUBLICZNE ŻW').setDescription(
        `Kandydat: <@${data.userId}>\n**Imię i nazwisko RP:** ${data.name}\n**Wiek RP:** ${data.age}\n**Doświadczenie:** ${data.experience}\n**Motywacja:** ${data.motivation}\n**Dyspozycyjność:** ${data.availability}`
      )], components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('application_accept').setLabel('Przyjmij do kandydatury').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('application_reject').setLabel('Odrzuć').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('close_ticket').setLabel('Zamknij').setStyle(ButtonStyle.Secondary)
      )] });
      return interaction.reply({ content: `✅ Podanie utworzone: ${channel}`, ephemeral: true });
    }
  } catch (error) {
    console.error(error);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Wystąpił błąd. Sprawdź logi bota.', ephemeral: true }).catch(() => {});
  }
});

client.login(TOKEN);
