require('dotenv').config();
const {
  Client, GatewayIntentBits, PermissionsBitField, ChannelType,
  REST, Routes, SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');
const db = require('./database');

const { TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!TOKEN || !CLIENT_ID || !GUILD_ID) throw new Error('Brak TOKEN, CLIENT_ID lub GUILD_ID w .env');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
const C = PermissionsBitField.Flags;

const RANKS = ['Szeregowy','Starszy szeregowy','Starszy szeregowy specjalista','Kapral','Starszy kapral','Plutonowy','Sierżant','Starszy sierżant','Młodszy chorąży','Chorąży','Starszy chorąży','Starszy chorąży sztabowy','Podporucznik','Porucznik','Kapitan','Major','Podpułkownik','Pułkownik','Generał brygady','Generał dywizji','Generał broni'];
const FUNCTIONS = ['Komendant Główny ŻW','Zastępca Komendanta Głównego','Szef Sztabu','Komendant Oddziału','Zastępca Komendanta Oddziału','Dowódca Wydziału','Dowódca Placówki','Dowódca Zespołu'];
const PIONS = ['Prewencyjny','Dochodzeniowo-śledczy','Operacyjno-rozpoznawczy','Administracyjno-logistyczno-techniczny'];
const UNITS = ['Komenda Główna ŻW','Oddział ŻW Warszawa','Oddział ŻW Bydgoszcz','Oddział ŻW Elbląg','Oddział ŻW Kraków','Oddział ŻW Szczecin','Oddział ŻW Żagań','Oddział Specjalny ŻW','Centrum Szkolenia ŻW','Oddział Zabezpieczenia ŻW'];
const STATUS = ['🟢 W służbie','⚫ Poza służbą','🔵 Szkolenie','🟣 Delegowany','🟠 Zawieszony','🔴 Wydalony'];
const ROLES = {
  citizen: '👤 Obywatel', candidate: '🎓 Kandydat ŻW', staff: '🛡️ Żołnierz ŻW', command: '👑 Dowództwo', bot: '🤖 ŻW BOT'
};
const channelIds = new Map();

const slug = s => s.toLowerCase().replaceAll('ą','a').replaceAll('ć','c').replaceAll('ę','e').replaceAll('ł','l').replaceAll('ń','n').replaceAll('ó','o').replaceAll('ś','s').replaceAll('ź','z').replaceAll('ż','z').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
async function getRole(guild, name, color) { return guild.roles.cache.find(r => r.name === name) || guild.roles.create({ name, color }); }
function allow(roleId, ...permissions) { return { id: roleId, allow: permissions }; }
function deny(roleId, ...permissions) { return { id: roleId, deny: permissions }; }

async function category(guild, name, roleAccess=[]) {
  let ch = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === name);
  const overwrites = [deny(guild.roles.everyone.id, C.ViewChannel)];
  for (const r of roleAccess) overwrites.push(allow(r.id, C.ViewChannel));
  overwrites.push(allow(channelIds.get('bot'), C.ViewChannel, C.SendMessages, C.ManageChannels, C.ManageMessages));
  if (!ch) ch = await guild.channels.create({ name, type: ChannelType.GuildCategory, permissionOverwrites: overwrites });
  else await ch.permissionOverwrites.set(overwrites).catch(()=>{});
  return ch;
}
async function text(guild, name, parent, roles, botWrite=true) {
  let ch = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name === name);
  const overwrites = [deny(guild.roles.everyone.id, C.ViewChannel)];
  for (const r of roles) overwrites.push(allow(r.id, C.ViewChannel, C.ReadMessageHistory, C.SendMessages));
  if (botWrite) overwrites.push(allow(channelIds.get('bot'), C.ViewChannel, C.ReadMessageHistory, C.SendMessages, C.ManageMessages));
  if (!ch) ch = await guild.channels.create({ name, type: ChannelType.GuildText, parent, permissionOverwrites: overwrites });
  else await ch.permissionOverwrites.set(overwrites).catch(()=>{});
  channelIds.set(name, ch.id);
  return ch;
}
async function voice(guild, name, parent, roles) {
  const overwrites = [deny(guild.roles.everyone.id, C.ViewChannel)];
  for (const r of roles) overwrites.push(allow(r.id, C.ViewChannel, C.Connect, C.Speak));
  overwrites.push(allow(channelIds.get('bot'), C.ViewChannel, C.Connect, C.Speak));
  return guild.channels.cache.find(c => c.type === ChannelType.GuildVoice && c.name === name) || guild.channels.create({ name, type: ChannelType.GuildVoice, parent, permissionOverwrites: overwrites });
}

async function setup(guild) {
  const citizen = await getRole(guild, ROLES.citizen, 0x808080);
  const candidate = await getRole(guild, ROLES.candidate, 0x3498db);
  const staff = await getRole(guild, ROLES.staff, 0x5865f2);
  const command = await getRole(guild, ROLES.command, 0xf1c40f);
  const bot = await getRole(guild, ROLES.bot, 0x2b2d31);
  channelIds.set('citizen', citizen.id); channelIds.set('candidate', candidate.id); channelIds.set('staff', staff.id); channelIds.set('command', command.id); channelIds.set('bot', bot.id);
  for (const r of RANKS) await getRole(guild, `🎖️ ${r}`);
  for (const f of FUNCTIONS) await getRole(guild, `📌 ${f}`);
  for (const p of PIONS) await getRole(guild, `🔹 Pion: ${p}`);
  for (const s of STATUS) await getRole(guild, s);
  for (const u of UNITS) await getRole(guild, `🏢 ${u}`);
  for (const x of ['🎓 Instruktor','📋 Kadry','🕵️ Pion Operacyjny','🔎 Pion Dochodzeniowo-Śledczy','🚔 Pion Prewencyjny','🛠️ Pion Logistyki']) await getRole(guild, x);

  const publicCat = await category(guild, '🇵🇱 INFORMACJE DLA OBYWATELI', [citizen]);
  for (const n of ['📢・ogłoszenia','📖・informacje','📜・regulamin','📝・rekrutacja','🎫・kontakt']) await text(guild, n, publicCat, [citizen]);

  const recCat = await category(guild, '🎓 REKRUTACJA', [citizen, candidate]);
  for (const n of ['📋・panel-podania','📚・wymagania','📊・statusy-rekrutacji','🎓・panel-egzaminu']) await text(guild, n, recCat, [citizen, candidate]);

  const serviceCat = await category(guild, '🪖 SŁUŻBA', [staff]);
  for (const n of ['📋・rozkazy','📝・meldunki','📑・raporty','📅・grafik-służby','📻・łączność','🚔・patrole']) await text(guild, n, serviceCat, [staff]);

  const hrCat = await category(guild, '📂 KADRY', [staff]);
  for (const n of ['👥・stan-osobowy','📋・sprawy-kadrowe','⬆️・awanse','⬇️・degradacje','⚠️・postępowania','🏅・wyróżnienia','📁・archiwum-kadr']) await text(guild, n, hrCat, [staff]);

  const trainCat = await category(guild, '🎓 SZKOLENIA', [staff, candidate]);
  for (const n of ['📚・materiały','🎓・szkolenia','📝・egzaminy','📊・wyniki-egzaminów','📋・kwalifikacje']) await text(guild, n, trainCat, [staff, candidate]);

  const unitsCat = await category(guild, '🏢 JEDNOSTKI ŻW', [staff]);
  for (const n of UNITS.map(u => `🏢・${slug(u.replace('ŻW',''))}`)) await text(guild, n, unitsCat, [staff]);

  const pionCat = await category(guild, '🔎 PIONY ŻW', [staff]);
  for (const n of ['🚔・prewencja','🔎・dochodzeniowo-śledczy','🕵️・operacyjno-rozpoznawczy','🛠️・logistyka-technika']) await text(guild, n, pionCat, [staff]);

  const commandCat = await category(guild, '👑 DOWÓDZTWO', [command]);
  for (const n of ['👑・gabinet-komendanta','⭐・narady-dowództwa','📜・rozkazy-wewnętrzne','📊・raporty-dowództwa','📋・sprawy-kadrowe','📁・archiwum-dowództwa']) await text(guild, n, commandCat, [command]);

  const logsCat = await category(guild, '🔐 LOGI', [command]);
  for (const n of ['📥・log-wejścia','📤・log-wyjścia','🎭・log-ról','📋・log-kadrowy','⬆️・log-awansów','⬇️・log-degradacji','⚠️・log-kar','📝・log-podań','🎓・log-egzaminów','🎫・log-ticketów','🛡️・log-administracji']) await text(guild, n, logsCat, [command]);

  const voiceCat = await category(guild, '🔊 ŁĄCZNOŚĆ GŁOSOWA', [staff]);
  for (const n of ['📻・Dyspozytornia','🚔・Patrol 01','🚔・Patrol 02','🎓・Sala szkoleniowa','👑・Dowództwo']) await voice(guild, n, voiceCat, [staff, command]);
  return { citizen, candidate, staff, command, bot };
}

function has(member, roleName) { return member.roles.cache.some(r => r.name === roleName); }
function isCommand(member) { return member.permissions.has(C.Administrator) || has(member, ROLES.command); }
function isStaff(member) { return isCommand(member) || has(member, ROLES.staff) || has(member, '📋 Kadry'); }
function isCandidate(member) { return has(member, ROLES.candidate); }
function recordBase(user, extra={}) { return { discordId: user.id, username: user.tag, createdAt: new Date().toISOString(), ...extra }; }

async function log(guild, type, title, description) {
  const channel = guild.channels.cache.get(channelIds.get(type)) || guild.channels.cache.find(c => c.name === `🛡️・log-${type}`);
  if (!channel) return;
  await channel.send({ embeds: [new EmbedBuilder().setTitle(title).setDescription(description).setTimestamp().setFooter({ text: 'Żandarmeria Wojskowa RP • System kadrowy' })] }).catch(()=>{});
}

const commands = [
  new SlashCommandBuilder().setName('żw-setup').setDescription('Uzupełnia strukturę ŻW RP.'),
  new SlashCommandBuilder().setName('żw-karta').setDescription('Pokazuje kartę służbową.').addUserOption(o=>o.setName('osoba').setDescription('Osoba').setRequired(true)),
  new SlashCommandBuilder().setName('żw-awans').setDescription('Nadaje stopień.').addUserOption(o=>o.setName('osoba').setDescription('Żołnierz').setRequired(true)).addStringOption(o=>o.setName('stopien').setDescription('Stopień').setRequired(true).setAutocomplete(true)),
  new SlashCommandBuilder().setName('żw-degradacja').setDescription('Zmienia stopień na niższy.').addUserOption(o=>o.setName('osoba').setDescription('Żołnierz').setRequired(true)).addStringOption(o=>o.setName('stopien').setDescription('Stopień').setRequired(true).setAutocomplete(true)),
  new SlashCommandBuilder().setName('żw-numer').setDescription('Nadaje numer służbowy.').addUserOption(o=>o.setName('osoba').setDescription('Osoba').setRequired(true)),
  new SlashCommandBuilder().setName('żw-status').setDescription('Zmienia status służby.').addUserOption(o=>o.setName('osoba').setDescription('Żołnierz').setRequired(true)).addStringOption(o=>o.setName('status').setDescription('Status').setRequired(true).addChoices(...STATUS.map(s=>({name:s,value:s})))),
  new SlashCommandBuilder().setName('żw-rekrutacja').setDescription('Wyświetla panel składania podania.'),
  new SlashCommandBuilder().setName('żw-egzamin').setDescription('Wyświetla panel egzaminu.'),
  new SlashCommandBuilder().setName('żw-kadra').setDescription('Wyświetla listę aktywnej kadry.'),
  new SlashCommandBuilder().setName('żw-logi').setDescription('Sprawdza kanały logów.')
].map(x=>x.toJSON());

async function register() { const rest = new REST({ version:'10' }).setToken(TOKEN); await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands }); }

client.once('ready', async () => {
  const guild = await client.guilds.fetch(GUILD_ID);
  await setup(guild);
  await register();
  console.log(`ŻW BOT v1 online: ${client.user.tag}`);
});

client.on('guildMemberAdd', async member => {
  const citizen = member.guild.roles.cache.find(r=>r.name===ROLES.citizen);
  if (citizen) await member.roles.add(citizen).catch(()=>{});
  await log(member.guild, 'wejścia', '📥 Nowy członek', `${member} otrzymał rolę **${ROLES.citizen}**.`);
});
client.on('guildMemberRemove', async member => log(member.guild, 'wyjścia', '📤 Członek opuścił serwer', `${member.user?.tag || member.id}`));

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isAutocomplete()) {
      const q = interaction.options.getString('stopien')?.toLowerCase() || '';
      return interaction.respond(RANKS.filter(r=>r.toLowerCase().includes(q)).slice(0,25).map(r=>({name:r,value:r})));
    }
    if (interaction.isButton()) {
      if (interaction.customId === 'zw_apply') {
        const modal = new ModalBuilder().setCustomId('zw_apply_modal').setTitle('Podanie do Żandarmerii Wojskowej');
        const fields = [
          ['age','Wiek','Podaj wiek'],['experience','Doświadczenie RP','Opisz doświadczenie'],['motivation','Motywacja','Dlaczego chcesz dołączyć?'],['availability','Dyspozycyjność','Kiedy możesz pełnić służbę?']
        ].map(([id,label,placeholder])=>new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setPlaceholder(placeholder).setStyle(TextInputStyle.Paragraph).setRequired(true)));
        return interaction.showModal(modal.addComponents(fields));
      }
      if (interaction.customId === 'zw_exam') {
        if (!isCandidate(interaction.member)) return interaction.reply({content:'Egzamin jest dostępny wyłącznie dla kandydata ŻW.',ephemeral:true});
        const modal = new ModalBuilder().setCustomId('zw_exam_modal').setTitle('Egzamin kandydata ŻW');
        return interaction.showModal(modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q1').setLabel('1. Zadania Żandarmerii Wojskowej').setStyle(TextInputStyle.Paragraph).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q2').setLabel('2. Zachowanie podczas kontroli').setStyle(TextInputStyle.Paragraph).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q3').setLabel('3. Zasady służby patrolowej').setStyle(TextInputStyle.Paragraph).setRequired(true))
        ));
      }
    }
    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'zw_apply_modal') {
        const id = `${interaction.user.id}-${Date.now()}`;
        db.createApplication(id, recordBase(interaction.user, { status:'NOWE', age:interaction.fields.getTextInputValue('age'), experience:interaction.fields.getTextInputValue('experience'), motivation:interaction.fields.getTextInputValue('motivation'), availability:interaction.fields.getTextInputValue('availability') }));
        const ch = interaction.guild.channels.cache.get(channelIds.get('📝・podania')) || interaction.guild.channels.cache.find(c=>c.name==='📝・podania-wewnętrzne');
        if (ch) await ch.send({embeds:[new EmbedBuilder().setTitle('📝 NOWE PODANIE ŻW').addFields({name:'Kandydat',value:`${interaction.user}`},{name:'Wiek',value:interaction.fields.getTextInputValue('age')},{name:'Doświadczenie',value:interaction.fields.getTextInputValue('experience').slice(0,1024)},{name:'Motywacja',value:interaction.fields.getTextInputValue('motivation').slice(0,1024)},{name:'Dyspozycyjność',value:interaction.fields.getTextInputValue('availability').slice(0,1024)})]});
        await log(interaction.guild,'podań','📝 Nowe podanie',`${interaction.user} złożył podanie. ID: **${id}**`);
        return interaction.reply({content:'✅ Podanie zostało złożone. O dalszych etapach poinformuje Cię kadra.',ephemeral:true});
      }
      if (interaction.customId === 'zw_exam_modal') {
        const id = `${interaction.user.id}-${Date.now()}`;
        db.createExam(id, recordBase(interaction.user,{status:'DO_OCENY',answers:[interaction.fields.getTextInputValue('q1'),interaction.fields.getTextInputValue('q2'),interaction.fields.getTextInputValue('q3')]}));
        await log(interaction.guild,'egzaminów','🎓 Nowy egzamin',`${interaction.user} przesłał egzamin do oceny. ID: **${id}**`);
        return interaction.reply({content:'✅ Egzamin został wysłany do oceny kadry.',ephemeral:true});
      }
    }
    if (!interaction.isChatInputCommand()) return;
    const { commandName: cmd, member, guild } = interaction;
    if (cmd === 'żw-setup') { if(!isCommand(member)) return interaction.reply({content:'Brak uprawnień.',ephemeral:true}); await setup(guild); return interaction.reply({content:'✅ Struktura ŻW RP została uzupełniona. Istniejące elementy nie zostały usunięte.',ephemeral:true}); }
    if (cmd === 'żw-rekrutacja') {
      const ch = guild.channels.cache.get(channelIds.get('📝・rekrutacja'));
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('zw_apply').setLabel('📝 Złóż podanie').setStyle(ButtonStyle.Primary));
      return interaction.reply({content:'🇵🇱 **REKRUTACJA DO ŻANDARMERII WOJSKOWEJ RP**\nKliknij przycisk, aby złożyć podanie.',components:[row]});
    }
    if (cmd === 'żw-egzamin') {
      if(!isCandidate(member) && !isStaff(member)) return interaction.reply({content:'Egzamin jest dostępny dla kandydatów i kadry.',ephemeral:true});
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('zw_exam').setLabel('🎓 Rozpocznij egzamin').setStyle(ButtonStyle.Success));
      return interaction.reply({content:'🎓 **EGZAMIN KANDYDATA ŻW**\nOdpowiedz na pytania zgodnie z zasadami RP.',components:[row],ephemeral:true});
    }
    if (cmd === 'żw-karta') {
      if(!isStaff(member) && interaction.options.getUser('osoba').id !== interaction.user.id) return interaction.reply({content:'Brak uprawnień.',ephemeral:true});
      const u=interaction.options.getUser('osoba'); const p=db.getPersonnel(u.id);
      if(!p) return interaction.reply({content:'Brak karty służbowej w bazie.',ephemeral:true});
      return interaction.reply({embeds:[new EmbedBuilder().setTitle('🇵🇱 KARTA SŁUŻBOWA ŻW').addFields({name:'Numer',value:p.serviceNumber||'—',inline:true},{name:'Stopień',value:p.rank||'—',inline:true},{name:'Stanowisko',value:p.function||'—',inline:true},{name:'Jednostka',value:p.unit||'—',inline:true},{name:'Pion',value:p.pion||'—',inline:true},{name:'Status',value:p.status||'—',inline:true}).setFooter({text:'ŻW RP • System kadrowy'})],ephemeral:true});
    }
    if (['żw-awans','żw-degradacja','żw-numer','żw-status','żw-kadra','żw-logi'].includes(cmd) && !isStaff(member)) return interaction.reply({content:'Brak uprawnień kadrowych.',ephemeral:true});
    if (cmd === 'żw-numer') {
      const u=interaction.options.getUser('osoba'); const old=db.getPersonnel(u.id)||{}; const serviceNumber=old.serviceNumber||db.nextNumber(); db.setPersonnel(u.id,{...old,...recordBase(u),serviceNumber,rank:old.rank||'Szeregowy',status:old.status||'⚫ Poza służbą'}); return interaction.reply(`✅ ${u} otrzymał numer służbowy **${serviceNumber}**.`);
    }
    if (cmd === 'żw-awans' || cmd === 'żw-degradacja') {
      const u=interaction.options.getUser('osoba'); const rank=interaction.options.getString('stopien'); const old=db.getPersonnel(u.id)||recordBase(u); db.setPersonnel(u.id,{...old,rank,history:[...(old.history||[]),{date:new Date().toISOString(),action:cmd,rank,by:interaction.user.id}]});
      const rr=guild.roles.cache.find(r=>r.name===`🎖️ ${rank}`); const m=await guild.members.fetch(u.id); for(const r of guild.roles.cache.filter(r=>r.name.startsWith('🎖️ ')).values()) if(m.roles.cache.has(r.id)) await m.roles.remove(r).catch(()=>{}); if(rr) await m.roles.add(rr).catch(()=>{});
      await log(guild,cmd==='żw-awans'?'awansów':'degradacji',cmd==='żw-awans'?'⬆️ Awans':'⬇️ Degradacja',`${u} → **${rank}**\nDecyzja: ${interaction.user}`); return interaction.reply(`✅ ${cmd==='żw-awans'?'Awans':'Degradacja'}: ${u} → **${rank}**.`);
    }
    if (cmd === 'żw-status') {
      const u=interaction.options.getUser('osoba'); const status=interaction.options.getString('status'); const old=db.getPersonnel(u.id)||recordBase(u); db.setPersonnel(u.id,{...old,status}); const m=await guild.members.fetch(u.id); for(const s of STATUS){const r=guild.roles.cache.find(x=>x.name===s);if(r&&m.roles.cache.has(r.id))await m.roles.remove(r).catch(()=>{});} const rr=guild.roles.cache.find(r=>r.name===status);if(rr)await m.roles.add(rr).catch(()=>{}); return interaction.reply(`✅ Status ${u}: **${status}**.`);
    }
    if (cmd === 'żw-kadra') {
      const list=db.allPersonnel().filter(p=>p.status!=='🔴 Wydalony').slice(0,25); return interaction.reply({embeds:[new EmbedBuilder().setTitle('👥 AKTYWNA KADRA ŻW').setDescription(list.length?list.map(p=>`**${p.serviceNumber||'—'}** • ${p.rank||'—'} • ${p.username}`).join('\n'):'Brak wpisów w bazie.')]});
    }
    if (cmd === 'żw-logi') return interaction.reply({content:'🔐 Kanały logów są dostępne wyłącznie dla Dowództwa.',ephemeral:true});
  } catch (e) { console.error(e); if(!interaction.replied && !interaction.deferred) await interaction.reply({content:'Wystąpił błąd. Sprawdź logi bota.',ephemeral:true}).catch(()=>{}); }
});

client.login(TOKEN);
