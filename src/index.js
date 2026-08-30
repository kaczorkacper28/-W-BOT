require('dotenv').config();
const {
  Client, GatewayIntentBits, Partials, PermissionsBitField, ChannelType,
  REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
if (!TOKEN || !CLIENT_ID || !GUILD_ID) throw new Error('Brak TOKEN, CLIENT_ID lub GUILD_ID w .env');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel]
});

const RANKS = [
  'Szeregowy','Starszy szeregowy','Starszy szeregowy specjalista',
  'Kapral','Starszy kapral','Plutonowy','Sierżant','Starszy sierżant',
  'Młodszy chorąży','Chorąży','Starszy chorąży','Starszy chorąży sztabowy',
  'Podporucznik','Porucznik','Kapitan','Major','Podpułkownik','Pułkownik',
  'Generał brygady','Generał dywizji','Generał broni'
];
const FUNCTIONS = ['Komendant Główny ŻW','Zastępca Komendanta Głównego','Szef Sztabu','Komendant Oddziału','Zastępca Komendanta Oddziału','Dowódca Wydziału','Dowódca Placówki','Dowódca Zespołu'];
const PIONS = ['Prewencyjny','Dochodzeniowo-śledczy','Operacyjno-rozpoznawczy','Administracyjno-logistyczno-techniczny'];
const CITIZEN = '👤 Obywatel';
const STAFF = '🛡️ Kadra';
const COMMAND = '👑 Dowództwo';
const LOGS = '🔐 Logi';
const RECRUIT = '🎓 Rekrutacja';
const channels = new Map();

function perms(view=false, send=false) {
  const p = [];
  if (view) p.push(PermissionsBitField.Flags.ViewChannel);
  if (send) p.push(PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory);
  return p;
}

async function role(guild, name, options={}) {
  return guild.roles.cache.find(r => r.name === name) || guild.roles.create({ name, ...options });
}

async function cat(guild, name, citizen=false, staff=false) {
  const existing = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === name);
  if (existing) return existing;
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] }
  ];
  if (citizen) overwrites.push({ id: channels.citizenRole.id, allow: perms(true,true) });
  if (staff) overwrites.push({ id: channels.staffRole.id, allow: perms(true,true) });
  overwrites.push({ id: channels.botRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ManageMessages] });
  return guild.channels.create({ name, type: ChannelType.GuildCategory, permissionOverwrites: overwrites });
}

async function text(guild, name, parent, opts={}) {
  const existing = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name === name);
  if (existing) return existing;
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    { id: channels.botRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageMessages] }
  ];
  if (opts.citizen) overwrites.push({ id: channels.citizenRole.id, allow: perms(true, true) });
  if (opts.staff) overwrites.push({ id: channels.staffRole.id, allow: perms(true, true) });
  if (opts.command) overwrites.push({ id: channels.commandRole.id, allow: perms(true, true) });
  if (opts.recruit) overwrites.push({ id: channels.citizenRole.id, allow: perms(true, true) }, { id: channels.recruitRole.id, allow: perms(true,true) });
  return guild.channels.create({ name, type: ChannelType.GuildText, parent, permissionOverwrites: overwrites });
}

async function setupGuild(guild) {
  channels.citizenRole = await role(guild, CITIZEN, { color: 0x808080 });
  channels.staffRole = await role(guild, STAFF, { color: 0x5865f2 });
  channels.commandRole = await role(guild, COMMAND, { color: 0xf1c40f });
  channels.recruitRole = await role(guild, '🎓 Kandydat ŻW', { color: 0x3498db });
  channels.botRole = guild.roles.cache.find(r => r.name === 'ŻW BOT') || await guild.roles.create({ name:'ŻW BOT', color:0x2b2d31 });
  channels.rankRoles = [];
  for (const r of RANKS) channels.rankRoles.push(await role(guild, `🎖️ ${r}`));
  for (const f of FUNCTIONS) await role(guild, `📌 ${f}`);
  for (const p of PIONS) await role(guild, `🔹 Pion: ${p}`);
  for (const u of ['🟢 W służbie','⚫ Poza służbą','🔵 Szkolenie','🟠 Zawieszony','🔴 Wydalony']) await role(guild,u);

  const publicCat = await cat(guild,'🇵🇱 INFORMACJE DLA OBYWATELI',true,false);
  for (const n of ['📢・ogłoszenia','📖・informacje','📜・regulamin','📝・rekrutacja','🎫・kontakt']) await text(guild,n,publicCat,{citizen:true});

  const recCat = await cat(guild,'🎓 REKRUTACJA',false,false);
  for (const n of ['📋・pytania-rekrutacyjne','📝・podania-wewnętrzne','📊・wyniki-rekrutacji','🎓・egzamin-kandydata']) await text(guild,n,recCat,{recruit:true});

  const serviceCat = await cat(guild,'🪖 SŁUŻBA',false,true);
  for (const n of ['📋・rozkazy','📝・meldunki','📑・raporty','📅・grafik-służby','📻・łączność','🚔・patrole']) await text(guild,n,serviceCat,{staff:true});

  const hrCat = await cat(guild,'📂 KADRY',false,true);
  for (const n of ['👥・stan-osobowy','📋・sprawy-kadrowe','⬆️・awanse','⬇️・degradacje','⚠️・postępowania','🏅・wyróżnienia','📁・archiwum-kadr']) await text(guild,n,hrCat,{staff:true});

  const trainingCat = await cat(guild,'🎓 SZKOLENIA',false,true);
  for (const n of ['📚・materiały','🎓・szkolenia','📝・egzaminy','📊・wyniki-egzaminów','📋・kwalifikacje']) await text(guild,n,trainingCat,{staff:true});

  const unitsCat = await cat(guild,'🏢 JEDNOSTKI ŻW',false,true);
  for (const n of ['🇵🇱・komenda-główna','🏢・oddział-warszawa','🏢・oddział-kraków','🏢・oddział-bydgoszcz','🏢・oddział-szczecin','🏢・oddział-elbląg','🏢・oddział-żagań','🛡️・oddział-specjalny','🎓・centrum-szkolenia','🛠️・oddział-zabezpieczenia']) await text(guild,n,unitsCat,{staff:true});

  const pionsCat = await cat(guild,'🔎 PIONY ŻW',false,true);
  for (const n of ['🚔・prewencja','🔎・dochodzeniowo-śledczy','🕵️・operacyjno-rozpoznawczy','🛠️・logistyka-technika']) await text(guild,n,pionsCat,{staff:true});

  const cmdCat = await cat(guild,'👑 DOWÓDZTWO',false,false);
  for (const n of ['👑・gabinet-komendanta','⭐・narady-dowództwa','📜・rozkazy-wewnętrzne','📊・raporty-dowództwa','📋・sprawy-kadrowe','📁・archiwum-dowództwa']) await text(guild,n,cmdCat,{command:true});

  const logCat = await cat(guild,'🔐 LOGI',false,false);
  for (const n of ['📥・log-wejścia','📤・log-wyjścia','🎭・log-ról','📋・log-kadrowy','⬆️・log-awansów','⬇️・log-degradacji','⚠️・log-kar','📝・log-podań','🎓・log-egzaminów','🎫・log-ticketów','🛡️・log-administracji']) await text(guild,n,logCat,{command:true});

  const panel = guild.channels.cache.find(c => c.name === '📢・ogłoszenia');
  if (panel && !panel.topic) await panel.setTopic('Oficjalne informacje Żandarmerii Wojskowej RP.');
  return true;
}

function isStaff(member) { return member.roles.cache.has(channels.staffRole?.id) || member.roles.cache.has(channels.commandRole?.id) || member.permissions.has(PermissionsBitField.Flags.Administrator); }
function isCommand(member) { return member.roles.cache.has(channels.commandRole?.id) || member.permissions.has(PermissionsBitField.Flags.Administrator); }

const commands = [
  new SlashCommandBuilder().setName('żw-setup').setDescription('Tworzy/uzupełnia pełną strukturę ŻW RP.'),
  new SlashCommandBuilder().setName('żw-karta').setDescription('Pokazuje kartę służbową.').addUserOption(o=>o.setName('osoba').setDescription('Żołnierz').setRequired(true)),
  new SlashCommandBuilder().setName('żw-awans').setDescription('Awansuje żołnierza.').addUserOption(o=>o.setName('osoba').setDescription('Żołnierz').setRequired(true)).addStringOption(o=>o.setName('stopien').setDescription('Nowy stopień').setRequired(true).setAutocomplete(true)),
  new SlashCommandBuilder().setName('żw-degradacja').setDescription('Nadaje niższy stopień.').addUserOption(o=>o.setName('osoba').setDescription('Żołnierz').setRequired(true)).addStringOption(o=>o.setName('stopien').setDescription('Nowy stopień').setRequired(true).setAutocomplete(true)),
  new SlashCommandBuilder().setName('żw-rekrutacja').setDescription('Otwiera panel składania podania.'),
  new SlashCommandBuilder().setName('żw-egzamin').setDescription('Otwiera panel egzaminacyjny dla kandydata.'),
  new SlashCommandBuilder().setName('żw-status').setDescription('Zmienia status służby.').addUserOption(o=>o.setName('osoba').setDescription('Żołnierz').setRequired(true)).addStringOption(o=>o.setName('status').setDescription('Status').setRequired(true).addChoices(...['🟢 W służbie','⚫ Poza służbą','🔵 Szkolenie','🟠 Zawieszony','🔴 Wydalony'].map(x=>({name:x,value:x})))),
  new SlashCommandBuilder().setName('żw-numer').setDescription('Nadaje/ustawia numer ŻW-XXXX.').addUserOption(o=>o.setName('osoba').setDescription('Osoba').setRequired(true)).addIntegerOption(o=>o.setName('numer').setDescription('Numer').setRequired(true).setMinValue(1))
].map(c=>c.toJSON());

async function register() { const rest=new REST({version:'10'}).setToken(TOKEN); await rest.put(Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID),{body:commands}); }

client.once('ready', async()=>{ const guild=await client.guilds.fetch(GUILD_ID); await setupGuild(guild); await register(); console.log(`ŻW BOT online jako ${client.user.tag}`); });

client.on('guildMemberAdd', async member=>{ try { await member.roles.add(channels.citizenRole); } catch(e) { console.error(e.message); } });

client.on('interactionCreate', async interaction=>{
  try {
    if (interaction.isAutocomplete()) { const q=interaction.options.getString('stopien')?.toLowerCase()||''; await interaction.respond(RANKS.filter(r=>r.toLowerCase().includes(q)).slice(0,25).map(r=>({name:r,value:r}))); return; }
    if (interaction.isChatInputCommand()) {
      const cmd=interaction.commandName;
      if (cmd==='żw-setup') { if(!isCommand(interaction.member)) return interaction.reply({content:'Brak uprawnień.',ephemeral:true}); await setupGuild(interaction.guild); return interaction.reply({content:'✅ Struktura ŻW RP została utworzona/uzupełniona.',ephemeral:true}); }
      if (cmd==='żw-karta') { const u=interaction.options.getUser('osoba'); const m=await interaction.guild.members.fetch(u.id); const rank=RANKS.find(r=>m.roles.cache.some(x=>x.name===`🎖️ ${r}`))||'Nie nadano'; const fn=FUNCTIONS.find(r=>m.roles.cache.some(x=>x.name===`📌 ${r}`))||'Brak'; const embed=new EmbedBuilder().setTitle('🇵🇱 KARTA SŁUŻBOWA ŻW').setDescription(`**Żołnierz:** ${u}\n**Stopień:** ${rank}\n**Stanowisko:** ${fn}\n**Status:** ${m.roles.cache.find(r=>r.name.includes('W służbie')||r.name.includes('Poza służbą')||r.name.includes('Szkolenie')||r.name.includes('Zawieszony')||r.name.includes('Wydalony'))?.name||'Nie określono'}`).setFooter({text:'Żandarmeria Wojskowa RP • System kadrowy'}); return interaction.reply({embeds:[embed],ephemeral:true}); }
      if (['żw-awans','żw-degradacja','żw-status','żw-numer'].includes(cmd) && !isStaff(interaction.member)) return interaction.reply({content:'Brak uprawnień kadrowych.',ephemeral:true});
      if (cmd==='żw-awans'||cmd==='żw-degradacja') { const m=await interaction.guild.members.fetch(interaction.options.getUser('osoba').id); const s=interaction.options.getString('stopien'); const rr=channels.rankRoles.find(r=>r.name===`🎖️ ${s}`); if(!rr) return interaction.reply({content:'Nie znaleziono roli stopnia.',ephemeral:true}); for(const r of channels.rankRoles) if(m.roles.cache.has(r.id)) await m.roles.remove(r); await m.roles.add(rr); return interaction.reply(`✅ ${cmd==='żw-awans'?'Awans':'Degradacja'}: ${m} → **${s}**.`); }
      if (cmd==='żw-status') { const m=await interaction.guild.members.fetch(interaction.options.getUser('osoba').id); const s=interaction.options.getString('status'); for(const n of ['🟢 W służbie','⚫ Poza służbą','🔵 Szkolenie','🟠 Zawieszony','🔴 Wydalony']) { const r=interaction.guild.roles.cache.find(x=>x.name===n); if(r && m.roles.cache.has(r.id)) await m.roles.remove(r); } await m.roles.add(interaction.guild.roles.cache.find(x=>x.name===s)); return interaction.reply(`✅ Status ${m} ustawiono na **${s}**.`); }
      if (cmd==='żw-numer') { const m=await interaction.guild.members.fetch(interaction.options.getUser('osoba').id); const n=interaction.options.getInteger('numer'); const nick=`ŻW-${String(n).padStart(4,'0')} | ${m.displayName.replace(/^ŻW-\d{4} \| /,'')}`; await m.setNickname(nick.slice(0,32)).catch(()=>{}); return interaction.reply(`✅ Nadano numer służbowy **ŻW-${String(n).padStart(4,'0')}**.`); }
      if (cmd==='żw-rekrutacja') { const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('zw_apply').setLabel('📝 Złóż podanie').setStyle(ButtonStyle.Primary)); return interaction.reply({content:'🇵🇱 **REKRUTACJA DO ŻANDARMERII WOJSKOWEJ RP**\nKliknij przycisk, aby wypełnić podanie.',components:[row]}); }
      if (cmd==='żw-egzamin') { const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('zw_exam').setLabel('🎓 Rozpocznij egzamin').setStyle(ButtonStyle.Success)); return interaction.reply({content:'🎓 **EGZAMIN KANDYDATA ŻW**\nEgzamin jest przeznaczony dla kandydatów.',components:[row],ephemeral:true}); }
    }
    if (interaction.isButton() && interaction.customId==='zw_apply') {
      const modal=new ModalBuilder().setCustomId('zw_apply_modal').setTitle('Podanie do ŻW RP');
      for(const [id,label] of [['wiek','Wiek'],['doświadczenie','Doświadczenie RP'],['motywacja','Dlaczego ŻW?'],['dyspozycyjnosc','Dyspozycyjność'],['dodatkowe','Dodatkowe informacje']]) modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)));
      return interaction.showModal(modal);
    }
    if (interaction.isButton() && interaction.customId==='zw_exam') {
      const questions=[['q1','Jaki jest podstawowy cel Żandarmerii Wojskowej?'],['q2','Czy podczas służby należy wykonywać polecenia przełożonych zgodne z regulaminem?'],['q3','Jak należy zachować się podczas kontroli osoby?']];
      const modal=new ModalBuilder().setCustomId('zw_exam_modal').setTitle('Egzamin ŻW RP');
      for(const [id,label] of questions) modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label.slice(0,45)).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500)));
      return interaction.showModal(modal);
    }
    if (interaction.isModalSubmit() && interaction.customId==='zw_apply_modal') {
      const values=['wiek','doświadczenie','motywacja','dyspozycyjnosc','dodatkowe'].map(k=>`**${k}:** ${interaction.fields.getTextInputValue(k)}`).join('\n');
      const embed=new EmbedBuilder().setTitle('📝 NOWE PODANIE DO ŻW').setDescription(`**Kandydat:** ${interaction.user}\n**ID:** ${interaction.user.id}\n\n${values}`).setTimestamp();
      const ch=interaction.guild.channels.cache.find(c=>c.name==='📝・podania-wewnętrzne'); if(ch) await ch.send({embeds:[embed]});
      return interaction.reply({content:'✅ Podanie zostało przekazane do rekrutacji.',ephemeral:true});
    }
    if (interaction.isModalSubmit() && interaction.customId==='zw_exam_modal') {
      const answers=[interaction.fields.getTextInputValue('q1'),interaction.fields.getTextInputValue('q2'),interaction.fields.getTextInputValue('q3')];
      const score=(answers[0].toLowerCase().includes('porządek')||answers[0].toLowerCase().includes('ochrona')?1:0)+(answers[1].toLowerCase().includes('tak')?1:0)+(answers[2].length>15?1:0);
      const ch=interaction.guild.channels.cache.find(c=>c.name==='📊・wyniki-egzaminów'); if(ch) await ch.send(`🎓 **Wynik egzaminu** — ${interaction.user} — **${score}/3**`);
      return interaction.reply({content:`🎓 Egzamin zakończony. Wynik: **${score}/3**. Ostateczną decyzję podejmuje kadra rekrutacyjna.`,ephemeral:true});
    }
  } catch(e) { console.error(e); if(interaction.isRepliable()&&!interaction.replied) await interaction.reply({content:'Wystąpił błąd. Sprawdź logi bota.',ephemeral:true}); }
});

client.login(TOKEN);
