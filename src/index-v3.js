require('dotenv').config();
const {
  Client, GatewayIntentBits, PermissionsBitField, ChannelType, REST, Routes,
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');
const db = require('./database');
const { TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!TOKEN || !CLIENT_ID || !GUILD_ID) throw new Error('Brak TOKEN, CLIENT_ID lub GUILD_ID w .env');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
const P = PermissionsBitField.Flags;
const RANKS = ['Szeregowy','Starszy szeregowy','Starszy szeregowy specjalista','Kapral','Starszy kapral','Plutonowy','Sierżant','Starszy sierżant','Młodszy chorąży','Chorąży','Starszy chorąży','Starszy chorąży sztabowy','Podporucznik','Porucznik','Kapitan','Major','Podpułkownik','Pułkownik','Generał brygady','Generał dywizji','Generał broni'];
const FUNCTIONS = ['Komendant Główny ŻW','Zastępca Komendanta Głównego','Szef Sztabu','Komendant Oddziału','Zastępca Komendanta Oddziału','Dowódca Wydziału','Dowódca Placówki','Dowódca Zespołu'];
const PIONS = ['Prewencyjny','Dochodzeniowo-śledczy','Operacyjno-rozpoznawczy','Administracyjno-logistyczno-techniczny'];
const UNITS = ['Komenda Główna ŻW','Oddział ŻW Warszawa','Oddział ŻW Bydgoszcz','Oddział ŻW Elbląg','Oddział ŻW Kraków','Oddział ŻW Szczecin','Oddział ŻW Żagań','Oddział Specjalny ŻW','Centrum Szkolenia ŻW','Oddział Zabezpieczenia ŻW'];
const STATUS = ['🟢 W służbie','⚫ Poza służbą','🔵 Szkolenie','🟣 Delegowany','🟠 Zawieszony','🔴 Wydalony'];
const N = { citizen:'👤 Obywatel', candidate:'🎓 Kandydat ŻW', staff:'🛡️ Żołnierz ŻW', command:'👑 Dowództwo', bot:'🤖 ŻW BOT' };
const ids = {};
const slug = s => s.toLowerCase().replaceAll('ą','a').replaceAll('ć','c').replaceAll('ę','e').replaceAll('ł','l').replaceAll('ń','n').replaceAll('ó','o').replaceAll('ś','s').replaceAll('ź','z').replaceAll('ż','z').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const role = async (g, name, color) => g.roles.cache.find(r => r.name === name) || g.roles.create({ name, colors: color });
const ow = (id, allow = [], deny = []) => ({ id, allow, deny });
const has = (m, n) => m.roles.cache.some(r => r.name === n);
const isStaff = m => has(m,N.staff) || has(m,'📋 Kadry') || has(m,N.command) || m.permissions.has(P.Administrator);
const isCommand = m => has(m,N.command) || m.permissions.has(P.Administrator);

async function cat(g, name, visible) {
  let c = g.channels.cache.find(x => x.type === ChannelType.GuildCategory && x.name === name);
  const o = [ow(g.roles.everyone.id, [], [P.ViewChannel])];
  for (const r of visible) o.push(ow(r.id, [P.ViewChannel]));
  o.push(ow(ids.bot, [P.ViewChannel, P.SendMessages, P.ManageChannels, P.ManageMessages]));
  if (!c) c = await g.channels.create({ name, type: ChannelType.GuildCategory, permissionOverwrites: o });
  else await c.permissionOverwrites.set(o).catch(() => {});
  return c;
}
async function ch(g, name, parent, visible, bot = true) {
  let c = g.channels.cache.find(x => x.type === ChannelType.GuildText && x.name === name);
  const o = [ow(g.roles.everyone.id, [], [P.ViewChannel])];
  for (const r of visible) o.push(ow(r.id, [P.ViewChannel, P.ReadMessageHistory, P.SendMessages]));
  if (bot) o.push(ow(ids.bot, [P.ViewChannel, P.ReadMessageHistory, P.SendMessages, P.ManageMessages]));
  if (!c) c = await g.channels.create({ name, type: ChannelType.GuildText, parent, permissionOverwrites: o });
  else await c.permissionOverwrites.set(o).catch(() => {});
  ids[name] = c.id;
  return c;
}
async function voice(g, name, parent, visible) {
  const o = [ow(g.roles.everyone.id, [], [P.ViewChannel])];
  for (const r of visible) o.push(ow(r.id, [P.ViewChannel, P.Connect, P.Speak]));
  o.push(ow(ids.bot, [P.ViewChannel, P.Connect, P.Speak]));
  return g.channels.cache.find(x => x.type === ChannelType.GuildVoice && x.name === name) || g.channels.create({ name, type: ChannelType.GuildVoice, parent, permissionOverwrites: o });
}
async function log(g, channelName, title, text) {
  const c = g.channels.cache.get(ids[channelName]) || g.channels.cache.find(x => x.name === channelName);
  if (c) await c.send({ embeds: [new EmbedBuilder().setTitle(title).setDescription(text).setTimestamp().setFooter({ text: 'ŻW RP • System kadrowy' }).setColor(0x5865f2)] }).catch(() => {});
}
async function createCandidateRoom(g, member) {
  const parent = g.channels.cache.find(x => x.type === ChannelType.GuildCategory && x.name === '🎓 REKRUTACJA — KANDYDAT');
  if (!parent) return null;
  const existing = g.channels.cache.find(x => x.type === ChannelType.GuildText && x.topic === `ZW-CANDIDATE:${member.id}`);
  if (existing) return existing;
  const o = [ow(g.roles.everyone.id, [], [P.ViewChannel]), ow(ids.candidate, [P.ViewChannel, P.ReadMessageHistory, P.SendMessages]), ow(ids.staff, [P.ViewChannel, P.ReadMessageHistory, P.SendMessages]), ow(ids.command, [P.ViewChannel, P.ReadMessageHistory, P.SendMessages]), ow(ids.bot, [P.ViewChannel, P.ReadMessageHistory, P.SendMessages, P.ManageMessages])];
  return g.channels.create({ name: `kandydat-${slug(member.user.username).slice(0,35)}`, type: ChannelType.GuildText, parent, topic: `ZW-CANDIDATE:${member.id}`, permissionOverwrites: o });
}
async function setup(g) {
  const citizen = await role(g,N.citizen,0x808080), candidate = await role(g,N.candidate,0x3498db), staff = await role(g,N.staff,0x5865f2), command = await role(g,N.command,0xf1c40f), bot = await role(g,N.bot,0x2b2d31);
  Object.assign(ids,{citizen:citizen.id,candidate:candidate.id,staff:staff.id,command:command.id,bot:bot.id});
  for (const r of RANKS) await role(g,`🎖️ ${r}`);
  for (const f of FUNCTIONS) await role(g,`📌 ${f}`);
  for (const p of PIONS) await role(g,`🔹 Pion: ${p}`);
  for (const s of STATUS) await role(g,s);
  for (const u of UNITS) await role(g,`🏢 ${u}`);
  const pub = await cat(g,'🇵🇱 INFORMACJE DLA OBYWATELI',[citizen]);
  for (const n of ['📢・ogłoszenia','📖・informacje','📜・regulamin','📝・rekrutacja','🎫・kontakt']) await ch(g,n,pub,[citizen]);
  const rec = await cat(g,'🎓 REKRUTACJA — PUBLICZNA',[citizen]);
  for (const n of ['📋・panel-podania','📚・wymagania-rekrutacji']) await ch(g,n,rec,[citizen]);
  const cand = await cat(g,'🎓 REKRUTACJA — KANDYDAT',[staff]);
  for (const n of ['📖・instrukcja-kandydata','🎓・egzamin-kandydata']) await ch(g,n,cand,[staff]);
  const internal = await cat(g,'🔒 REKRUTACJA — KADRA',[staff,command]);
  for (const n of ['📝・podania-wewnętrzne','📊・wyniki-rekrutacji']) await ch(g,n,internal,[staff,command]);
  const service = await cat(g,'🪖 SŁUŻBA',[staff]);
  for (const n of ['📋・rozkazy','📝・meldunki','📑・raporty','📅・grafik-służby','📻・łączność','🚔・patrole']) await ch(g,n,service,[staff]);
  const hr = await cat(g,'📂 KADRY',[staff]);
  for (const n of ['👥・stan-osobowy','📋・sprawy-kadrowe','⬆️・awanse','⬇️・degradacje','⚠️・postępowania','🏅・wyróżnienia','📁・archiwum-kadr']) await ch(g,n,hr,[staff]);
  const training = await cat(g,'🎓 SZKOLENIA',[staff,candidate]);
  for (const n of ['📚・materiały','🎓・szkolenia','📝・egzaminy','📊・wyniki-egzaminów','📋・kwalifikacje']) await ch(g,n,training,[staff,candidate]);
  const units = await cat(g,'🏢 JEDNOSTKI ŻW',[staff]);
  for (const u of UNITS) await ch(g,`🏢・${slug(u.replace('ŻW',''))}`,units,[staff]);
  const pions = await cat(g,'🔎 PIONY ŻW',[staff]);
  for (const n of ['🚔・prewencja','🔎・dochodzeniowo-śledczy','🕵️・operacyjno-rozpoznawczy','🛠️・logistyka-technika']) await ch(g,n,pions,[staff]);
  const cmd = await cat(g,'👑 DOWÓDZTWO',[command]);
  for (const n of ['👑・gabinet-komendanta','⭐・narady-dowództwa','📜・rozkazy-wewnętrzne','📊・raporty-dowództwa','📋・sprawy-kadrowe','📁・archiwum-dowództwa']) await ch(g,n,cmd,[command]);
  const logs = await cat(g,'🔐 LOGI',[command]);
  for (const n of ['📥・log-wejścia','📤・log-wyjścia','🎭・log-ról','📋・log-kadrowy','⬆️・log-awansów','⬇️・log-degradacji','⚠️・log-kar','📝・log-podań','🎓・log-egzaminów','🎫・log-ticketów','🛡️・log-administracji']) await ch(g,n,logs,[command]);
  const vc = await cat(g,'🔊 ŁĄCZNOŚĆ GŁOSOWA',[staff]);
  for (const n of ['📻・Dyspozytornia','🚔・Patrol 01','🚔・Patrol 02','🎓・Sala szkoleniowa','👑・Dowództwo']) await voice(g,n,vc,[staff,command]);
}

const commands = [
  new SlashCommandBuilder().setName('żw-setup').setDescription('Uzupełnia strukturę ŻW RP.'),
  new SlashCommandBuilder().setName('żw-karta').setDescription('Pokazuje kartę służbową.').addUserOption(o=>o.setName('osoba').setDescription('Osoba').setRequired(true)),
  new SlashCommandBuilder().setName('żw-numer').setDescription('Nadaje numer służbowy.').addUserOption(o=>o.setName('osoba').setDescription('Osoba').setRequired(true)),
  new SlashCommandBuilder().setName('żw-awans').setDescription('Nadaje stopień.').addUserOption(o=>o.setName('osoba').setDescription('Żołnierz').setRequired(true)).addStringOption(o=>o.setName('stopien').setDescription('Stopień').setRequired(true).setAutocomplete(true)),
  new SlashCommandBuilder().setName('żw-degradacja').setDescription('Nadaje stopień.').addUserOption(o=>o.setName('osoba').setDescription('Żołnierz').setRequired(true)).addStringOption(o=>o.setName('stopien').setDescription('Stopień').setRequired(true).setAutocomplete(true)),
  new SlashCommandBuilder().setName('żw-status').setDescription('Zmienia status.').addUserOption(o=>o.setName('osoba').setDescription('Żołnierz').setRequired(true)).addStringOption(o=>o.setName('status').setDescription('Status').setRequired(true).addChoices(...STATUS.map(x=>({name:x,value:x})))),
  new SlashCommandBuilder().setName('żw-kadra').setDescription('Pokazuje aktywną kadrę.'),
  new SlashCommandBuilder().setName('żw-rekrutacja').setDescription('Publikuje panel podania.'),
  new SlashCommandBuilder().setName('żw-egzamin').setDescription('Publikuje panel egzaminu dla kandydata.'),
  new SlashCommandBuilder().setName('żw-podania').setDescription('Pokazuje oczekujące podania.'),
  new SlashCommandBuilder().setName('żw-egzaminy').setDescription('Pokazuje egzaminy oczekujące na ocenę.'),
  new SlashCommandBuilder().setName('żw-status-rekrutacji').setDescription('Pokazuje Twój status rekrutacji.')
].map(x=>x.toJSON());
async function register(){const rest=new REST({version:'10'}).setToken(TOKEN);await rest.put(Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID),{body:commands});}

client.once('clientReady',async()=>{const g=await client.guilds.fetch(GUILD_ID);await setup(g);await register();console.log(`ŻW BOT v3 online jako ${client.user.tag}`);});
client.on('guildMemberAdd',async m=>{const r=m.guild.roles.cache.find(x=>x.name===N.citizen);if(r)await m.roles.add(r).catch(()=>{});await log(m.guild,'📥・log-wejścia','📥 Nowy członek',`${m} otrzymał rolę **${N.citizen}**.`);});
client.on('guildMemberRemove',async m=>log(m.guild,'📤・log-wyjścia','📤 Odejście z serwera',m.user?.tag||m.id));

function applicationEmbed(app){return new EmbedBuilder().setTitle('📝 NOWE PODANIE DO ŻW').setDescription(`ID: **${app.id}**`).addFields({name:'Kandydat',value:`<@${app.discordId}>`},{name:'Wiek',value:app.age||'—',inline:true},{name:'Status',value:app.status||'NOWE',inline:true},{name:'Doświadczenie RP',value:(app.experience||'—').slice(0,1024)},{name:'Motywacja',value:(app.motivation||'—').slice(0,1024)},{name:'Dyspozycyjność',value:(app.availability||'—').slice(0,1024)}).setTimestamp();}
function applicationButtons(id, disabled=false){return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`app_accept:${id}`).setLabel('✅ Przyjmij do rekrutacji').setStyle(ButtonStyle.Success).setDisabled(disabled),new ButtonBuilder().setCustomId(`app_reject:${id}`).setLabel('❌ Odrzuć podanie').setStyle(ButtonStyle.Danger).setDisabled(disabled));}
function examButtons(id, disabled=false){return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`exam_pass:${id}`).setLabel('✅ Zdaj').setStyle(ButtonStyle.Success).setDisabled(disabled),new ButtonBuilder().setCustomId(`exam_fail:${id}`).setLabel('❌ Nie zdał').setStyle(ButtonStyle.Danger).setDisabled(disabled));}

client.on('interactionCreate',async i=>{try{
  if(i.isAutocomplete()){const q=(i.options.getString('stopien')||'').toLowerCase();return i.respond(RANKS.filter(x=>x.toLowerCase().includes(q)).slice(0,25).map(x=>({name:x,value:x})));}
  if(i.isButton()){
    if(i.customId==='apply'){
      if(!has(i.member,N.citizen)) return i.reply({content:'Rekrutacja jest dostępna dla obywateli.',ephemeral:true});
      const modal=new ModalBuilder().setCustomId('applyModal').setTitle('Podanie do ŻW');
      for(const [id,label] of [['age','Wiek'],['experience','Doświadczenie RP'],['motivation','Motywacja do służby'],['availability','Dyspozycyjność']]) modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Paragraph).setRequired(true)));
      return i.showModal(modal);
    }
    if(i.customId==='exam'){
      if(!has(i.member,N.candidate)) return i.reply({content:'Egzamin jest dostępny po przyjęciu do rekrutacji.',ephemeral:true});
      const modal=new ModalBuilder().setCustomId('examModal').setTitle('Egzamin kandydata ŻW');
      for(const [id,label] of [['q1','Zadania Żandarmerii Wojskowej'],['q2','Zachowanie podczas kontroli'],['q3','Zasady służby patrolowej']]) modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Paragraph).setRequired(true)));
      return i.showModal(modal);
    }
    if(i.customId.startsWith('app_accept:') || i.customId.startsWith('app_reject:')){
      if(!isStaff(i.member)) return i.reply({content:'Brak uprawnień kadrowych.',ephemeral:true});
      const [action,id]=i.customId.split(':'); const app=db.getApplication(id);
      if(!app) return i.reply({content:'Nie znaleziono podania.',ephemeral:true});
      if(app.status!=='NOWE') return i.reply({content:`Podanie ma już status: ${app.status}.`,ephemeral:true});
      const member=await i.guild.members.fetch(app.discordId).catch(()=>null);
      if(action==='app_reject'){
        db.updateApplication(id,{status:'ODRZUCONE',reviewedBy:i.user.id,reviewedAt:new Date().toISOString()});
        await log(i.guild,'📝・log-podań','❌ Odrzucono podanie',`ID: **${id}**\nKandydat: <@${app.discordId}>\nDecyzja: ${i.user}`);
        await i.update({embeds:[applicationEmbed({...app,status:'ODRZUCONE'})],components:[applicationButtons(id,true)]});
        if(member) await member.send('❌ Twoje podanie do Żandarmerii Wojskowej RP zostało odrzucone.').catch(()=>{});
        return;
      }
      db.updateApplication(id,{status:'PRZYJĘTY DO REKRUTACJI',reviewedBy:i.user.id,reviewedAt:new Date().toISOString()});
      if(member){const candRole=i.guild.roles.cache.get(ids.candidate);if(candRole) await member.roles.add(candRole).catch(()=>{});const room=await createCandidateRoom(i.guild,member);if(room) await room.send(`🎓 Witaj ${member}!\nTwoje podanie zostało przyjęte. Tutaj otrzymasz informacje dotyczące dalszych etapów. Użyj **/żw-egzamin**, gdy kadra poinformuje Cię o gotowości.`);await member.send('✅ Twoje podanie zostało przyjęte. Otrzymałeś rolę Kandydata ŻW.').catch(()=>{});}
      await log(i.guild,'📝・log-podań','✅ Przyjęto kandydata',`ID: **${id}**\nKandydat: <@${app.discordId}>\nDecyzja: ${i.user}`);
      return i.update({embeds:[applicationEmbed({...app,status:'PRZYJĘTY DO REKRUTACJI'})],components:[applicationButtons(id,true)]});
    }
    if(i.customId.startsWith('exam_pass:') || i.customId.startsWith('exam_fail:')){
      if(!isStaff(i.member)) return i.reply({content:'Brak uprawnień kadrowych.',ephemeral:true});
      const [action,id]=i.customId.split(':'); const ex=db.getExam(id);
      if(!ex) return i.reply({content:'Nie znaleziono egzaminu.',ephemeral:true});
      if(ex.status!=='DO_OCENY') return i.reply({content:`Egzamin ma już status: ${ex.status}.`,ephemeral:true});
      const member=await i.guild.members.fetch(ex.discordId).catch(()=>null); const passed=action==='exam_pass';
      if(passed){
        const old=db.getPersonnel(ex.discordId)||{}; const number=old.serviceNumber||db.nextNumber();
        db.setPersonnel(ex.discordId,{...old,discordId:ex.discordId,username:ex.username,serviceNumber:number,rank:old.rank||'Szeregowy',status:'⚫ Poza służbą',joinedAt:old.joinedAt||new Date().toISOString(),recruitment:{examId:id,acceptedBy:i.user.id}});
        if(member){const staffRole=i.guild.roles.cache.get(ids.staff), candRole=i.guild.roles.cache.get(ids.candidate), rankRole=i.guild.roles.cache.find(r=>r.name==='🎖️ Szeregowy');if(candRole) await member.roles.remove(candRole).catch(()=>{});if(staffRole) await member.roles.add(staffRole).catch(()=>{});if(rankRole) await member.roles.add(rankRole).catch(()=>{});await member.send(`🇵🇱 Gratulacje! Egzamin został zaliczony. Zostałeś przyjęty do ŻW RP. Twój numer służbowy: **${number}**.`).catch(()=>{});}
      }
      db.updateExam(id,{status:passed?'ZALICZONY':'NIEZALICZONY',reviewedBy:i.user.id,reviewedAt:new Date().toISOString()});
      await log(i.guild,'🎓・log-egzaminów',passed?'✅ Egzamin zaliczony':'❌ Egzamin niezaliczony',`ID: **${id}**\nKandydat: <@${ex.discordId}>\nOceniający: ${i.user}${passed?'\nNumer: **'+(db.getPersonnel(ex.discordId)?.serviceNumber||'—')+'**':''}`);
      return i.update({embeds:[new EmbedBuilder().setTitle(passed?'✅ EGZAMIN ZALICZONY':'❌ EGZAMIN NIEZALICZONY').setDescription(`ID: **${id}**\nKandydat: <@${ex.discordId}>`).setTimestamp()],components:[examButtons(id,true)]});
    }
  }
  if(i.isModalSubmit()){
    if(i.customId==='applyModal'){
      const existing=db.allApplications().find(a=>a.discordId===i.user.id && ['NOWE','PRZYJĘTY DO REKRUTACJI'].includes(a.status));
      if(existing) return i.reply({content:'Masz już aktywne podanie. Poczekaj na decyzję kadry.',ephemeral:true});
      const id=`P-${Date.now()}-${i.user.id.slice(-4)}`; const app={id,discordId:i.user.id,username:i.user.tag,status:'NOWE',createdAt:new Date().toISOString(),age:i.fields.getTextInputValue('age'),experience:i.fields.getTextInputValue('experience'),motivation:i.fields.getTextInputValue('motivation'),availability:i.fields.getTextInputValue('availability')};
      db.createApplication(id,app); const c=i.guild.channels.cache.get(ids['📝・podania-wewnętrzne']); if(c) await c.send({embeds:[applicationEmbed(app)],components:[applicationButtons(id)]});
      await log(i.guild,'📝・log-podań','📝 Nowe podanie',`ID: **${id}**\nKandydat: ${i.user}`);
      return i.reply({content:'✅ Podanie zostało wysłane do kadry ŻW.',ephemeral:true});
    }
    if(i.customId==='examModal'){
      const active=db.allApplications().find(a=>a.discordId===i.user.id && a.status==='PRZYJĘTY DO REKRUTACJI');
      if(!active) return i.reply({content:'Nie masz aktywnej rekrutacji.',ephemeral:true});
      const existing=db.allExams().find(e=>e.discordId===i.user.id && e.status==='DO_OCENY');
      if(existing) return i.reply({content:'Twój egzamin jest już w trakcie oceny.',ephemeral:true});
      const id=`E-${Date.now()}-${i.user.id.slice(-4)}`; const ex={id,discordId:i.user.id,username:i.user.tag,status:'DO_OCENY',createdAt:new Date().toISOString(),answers:[i.fields.getTextInputValue('q1'),i.fields.getTextInputValue('q2'),i.fields.getTextInputValue('q3')]};
      db.createExam(id,ex); const c=i.guild.channels.cache.get(ids['📊・wyniki-egzaminów']); if(c) await c.send({embeds:[new EmbedBuilder().setTitle('🎓 NOWY EGZAMIN DO OCENY').setDescription(`ID: **${id}**\nKandydat: <@${i.user.id}>`).addFields(ex.answers.map((a,n)=>({name:`Pytanie ${n+1}`,value:a.slice(0,1024)})))],components:[examButtons(id)]});
      await log(i.guild,'🎓・log-egzaminów','🎓 Nowy egzamin',`ID: **${id}**\nKandydat: ${i.user}`); return i.reply({content:'✅ Egzamin został wysłany do oceny.',ephemeral:true});
    }
  }
  if(!i.isChatInputCommand()) return; const m=i.member,g=i.guild;
  if(i.commandName==='żw-setup'){if(!isCommand(m)) return i.reply({content:'Brak uprawnień.',ephemeral:true});await setup(g);return i.reply({content:'✅ Struktura ŻW została uzupełniona. Istniejące elementy zachowano.',ephemeral:true});}
  if(i.commandName==='żw-rekrutacja'){const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('apply').setLabel('📝 Złóż podanie').setStyle(ButtonStyle.Primary));return i.reply({content:'🇵🇱 **REKRUTACJA DO ŻANDARMERII WOJSKOWEJ RP**\nKliknij przycisk, aby złożyć podanie.',components:[row]});}
  if(i.commandName==='żw-egzamin'){if(!has(m,N.candidate)) return i.reply({content:'Egzamin jest dostępny po przyjęciu podania.',ephemeral:true});const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('exam').setLabel('🎓 Rozpocznij egzamin').setStyle(ButtonStyle.Success));return i.reply({content:'🎓 **EGZAMIN KANDYDATA ŻW**\nOdpowiedz na wszystkie pytania. Wynik oceni kadra.',components:[row],ephemeral:true});}
  if(i.commandName==='żw-status-rekrutacji'){const apps=db.allApplications().filter(a=>a.discordId===i.user.id).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));const exs=db.allExams().filter(e=>e.discordId===i.user.id).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));const app=apps[0];if(!app)return i.reply({content:'Nie masz jeszcze złożonego podania.',ephemeral:true});return i.reply({ephemeral:true,embeds:[new EmbedBuilder().setTitle('📋 STATUS REKRUTACJI').addFields({name:'Podanie',value:app.status},{name:'ID podania',value:app.id},{name:'Egzamin',value:exs[0]?.status||'Jeszcze nie złożono'},{name:'Numer ŻW',value:db.getPersonnel(i.user.id)?.serviceNumber||'Jeszcze nie nadano'})]});}
  if(i.commandName==='żw-podania'){if(!isStaff(m))return i.reply({content:'Brak uprawnień kadrowych.',ephemeral:true});const list=db.allApplications().filter(a=>a.status==='NOWE').slice(-10).reverse();return i.reply({ephemeral:true,embeds:[new EmbedBuilder().setTitle('📝 OCZEKUJĄCE PODANIA').setDescription(list.length?list.map(a=>`**${a.id}** • <@${a.discordId}>`).join('\n'):'Brak oczekujących podań.')]});}
  if(i.commandName==='żw-egzaminy'){if(!isStaff(m))return i.reply({content:'Brak uprawnień kadrowych.',ephemeral:true});const list=db.allExams().filter(e=>e.status==='DO_OCENY').slice(-10).reverse();return i.reply({ephemeral:true,embeds:[new EmbedBuilder().setTitle('🎓 EGZAMINY DO OCENY').setDescription(list.length?list.map(e=>`**${e.id}** • <@${e.discordId}>`).join('\n'):'Brak egzaminów do oceny.')]});}
  if(!isStaff(m))return i.reply({content:'Brak uprawnień kadrowych.',ephemeral:true});
  if(i.commandName==='żw-numer'){const u=i.options.getUser('osoba'),old=db.getPersonnel(u.id)||{},num=old.serviceNumber||db.nextNumber();db.setPersonnel(u.id,{...old,discordId:u.id,username:u.tag,serviceNumber:num,rank:old.rank||'Szeregowy',status:old.status||'⚫ Poza służbą'});return i.reply(`✅ ${u} otrzymał numer **${num}**.`);}
  if(i.commandName==='żw-awans'||i.commandName==='żw-degradacja'){const u=i.options.getUser('osoba'),rank=i.options.getString('stopien'),old=db.getPersonnel(u.id)||{};db.setPersonnel(u.id,{...old,discordId:u.id,username:u.tag,rank,history:[...(old.history||[]),{action:i.commandName,rank,date:new Date().toISOString(),by:i.user.id}]});const mm=await g.members.fetch(u.id),rr=g.roles.cache.find(r=>r.name===`🎖️ ${rank}`);for(const r of g.roles.cache.filter(r=>r.name.startsWith('🎖️ ')).values())if(mm.roles.cache.has(r.id))await mm.roles.remove(r).catch(()=>{});if(rr)await mm.roles.add(rr).catch(()=>{});await log(g,i.commandName==='żw-awans'?'⬆️・log-awansów':'⬇️・log-degradacji',i.commandName==='żw-awans'?'⬆️ Awans':'⬇️ Degradacja',`${u} → **${rank}**\nDecyzja: ${i.user}`);return i.reply(`✅ Zmieniono stopień ${u} → **${rank}**.`);}
  if(i.commandName==='żw-status'){const u=i.options.getUser('osoba'),s=i.options.getString('status'),old=db.getPersonnel(u.id)||{};db.setPersonnel(u.id,{...old,discordId:u.id,username:u.tag,status:s});const mm=await g.members.fetch(u.id);for(const x of STATUS){const r=g.roles.cache.find(r=>r.name===x);if(r&&mm.roles.cache.has(r.id))await mm.roles.remove(r).catch(()=>{});}const rr=g.roles.cache.find(r=>r.name===s);if(rr)await mm.roles.add(rr).catch(()=>{});return i.reply(`✅ Status ${u}: **${s}**.`);}
  if(i.commandName==='żw-karta'){const u=i.options.getUser('osoba');if(u.id!==i.user.id&&!isStaff(m))return i.reply({content:'Brak uprawnień.',ephemeral:true});const p=db.getPersonnel(u.id);if(!p)return i.reply({content:'Brak karty służbowej.',ephemeral:true});return i.reply({ephemeral:true,embeds:[new EmbedBuilder().setTitle('🇵🇱 KARTA SŁUŻBOWA ŻW').addFields({name:'Numer',value:p.serviceNumber||'—',inline:true},{name:'Stopień',value:p.rank||'—',inline:true},{name:'Stanowisko',value:p.function||'—',inline:true},{name:'Jednostka',value:p.unit||'—',inline:true},{name:'Pion',value:p.pion||'—',inline:true},{name:'Status',value:p.status||'—',inline:true})]});}
  if(i.commandName==='żw-kadra'){const list=db.allPersonnel().filter(x=>x.status!=='🔴 Wydalony').slice(0,25);return i.reply({embeds:[new EmbedBuilder().setTitle('👥 AKTYWNA KADRA ŻW').setDescription(list.length?list.map(x=>`**${x.serviceNumber||'—'}** • ${x.rank||'—'} • ${x.username}`).join('\n'):'Brak wpisów.')]});}
}catch(e){console.error(e);if(!i.replied&&!i.deferred)await i.reply({content:'Wystąpił błąd. Sprawdź logi bota.',ephemeral:true}).catch(()=>{});}});
client.login(TOKEN);
