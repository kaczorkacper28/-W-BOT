require('dotenv').config();
const { Client, ChannelType, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

const P = PermissionsBitField.Flags;
const STAFF_ROLE_IDS = (process.env.STAFF_ROLE_IDS || '').split(',').map(x => x.trim()).filter(Boolean);
const FILE = path.join(process.cwd(), 'data', 'zw-final.json');

function loadDB(){
  try { return JSON.parse(fs.readFileSync(FILE,'utf8')); }
  catch { return {applications:[],people:{}}; }
}
function saveDB(db){ fs.mkdirSync(path.dirname(FILE),{recursive:true}); fs.writeFileSync(FILE,JSON.stringify(db,null,2)); }
function staff(i){ return !!i.member && (i.member.permissions.has(P.Administrator) || STAFF_ROLE_IDS.some(id=>i.member.roles.cache.has(id))); }
function findChannel(g,names){ return g.channels.cache.find(c=>c.type===ChannelType.GuildText && names.includes(c.name.replace(/^[^・]+・/,'').toLowerCase())); }
function channel(g,needle){
  const n=needle.toLowerCase();
  return g.channels.cache.find(c=>c.type===ChannelType.GuildText && c.name.toLowerCase().includes(n));
}
function candidateRole(g){ return g.roles.cache.find(r=>r.name==='🎓 Kandydat ŻW'); }
function staffChannels(g){ return channel(g,'podania-wewnetrzne') || channel(g,'wyniki-rekrutacji'); }
function candidateCategory(g){ return g.channels.cache.find(c=>c.type===ChannelType.GuildCategory && c.name.includes('REKRUTACJA — KANDYDAT')); }
function safeName(s){ return String(s||'kandydat').toLowerCase().replace(/[^a-z0-9-]/g,'-').slice(0,25) || 'kandydat'; }

function publicPanel(){
  return {
    embeds:[new EmbedBuilder().setTitle('📋 PODANIE PUBLICZNE — ŻANDARMERIA WOJSKOWA RP').setDescription('Złóż **podanie publiczne** o rozpoczęcie rekrutacji do Żandarmerii Wojskowej RP.\n\nPo wysłaniu formularza kadra rozpatrzy zgłoszenie. Po pozytywnej decyzji otrzymasz rolę **🎓 Kandydat ŻW** i dostęp do dalszego etapu rekrutacji.')],
    components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('zw-public-apply').setLabel('Złóż podanie publiczne').setEmoji('📋').setStyle(ButtonStyle.Primary))]
  };
}
function candidatePanel(){
  return {
    embeds:[new EmbedBuilder().setTitle('📋 PODANIE KANDYDATA ŻW').setDescription('Ten formularz jest przeznaczony **wyłącznie dla osób posiadających rolę 🎓 Kandydat ŻW**.\n\nPodanie służy do dalszej kwalifikacji kandydata. Nie jest to automatyczny egzamin.')],
    components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('zw-candidate-apply').setLabel('Złóż podanie kandydata').setEmoji('🎓').setStyle(ButtonStyle.Success))]
  };
}
function modalPublic(){
  const m=new ModalBuilder().setCustomId('zw-public-modal').setTitle('Podanie publiczne ŻW');
  [['wiek','Wiek'],['dane','Dane postaci RP'],['doswiadczenie','Doświadczenie RP'],['motywacja','Dlaczego ŻW?'],['dyspozycyjnosc','Dyspozycyjność']].forEach(([id,label])=>m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(id==='wiek'?TextInputStyle.Short:TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000))));
  return m;
}
function modalCandidate(){
  const m=new ModalBuilder().setCustomId('zw-candidate-modal').setTitle('Podanie kandydata ŻW');
  [['stanowisko','Preferowany pion / stanowisko'],['znajomosc','Znajomość zasad służby'],['dyspozycyjnosc','Dyspozycyjność'],['motywacja','Motywacja do dalszej służby'],['dodatkowe','Dodatkowe informacje']].forEach(([id,label])=>m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000))));
  return m;
}
async function makeTicket(i,type,data){
  const g=i.guild;
  const parent=candidateCategory(g);
  if(!parent) throw new Error('Nie znaleziono kategorii REKRUTACJA — KANDYDAT.');
  const db=loadDB();
  const open=g.channels.cache.find(c=>c.topic===`ZW-APPLICATION:${type}:${i.user.id}`);
  if(open) throw new Error(`Masz już otwarte podanie: ${open}`);
  const overwrites=[
    {id:g.roles.everyone.id,deny:[P.ViewChannel]},
    {id:i.user.id,allow:[P.ViewChannel,P.SendMessages,P.ReadMessageHistory]},
    ...(STAFF_ROLE_IDS.map(id=>({id,allow:[P.ViewChannel,P.SendMessages,P.ReadMessageHistory,P.ManageMessages]})))
  ];
  if(g.members.me) overwrites.push({id:g.members.me.id,allow:[P.ViewChannel,P.SendMessages,P.ReadMessageHistory,P.ManageChannels,P.ManageMessages]});
  const name=`${type==='public'?'podanie-publiczne':'podanie-kandydata'}-${safeName(i.user.username)}`;
  const ch=await g.channels.create({name,type:ChannelType.GuildText,parent:parent.id,topic:`ZW-APPLICATION:${type}:${i.user.id}`,permissionOverwrites:overwrites});
  const record={id:`${i.user.id}-${Date.now()}`,user:i.user.id,channel:ch.id,type:type==='public'?'PUBLICZNE':'KANDYDATA',status:'OCZEKUJE',at:new Date().toISOString(),...data};
  db.applications=Array.isArray(db.applications)?db.applications:[]; db.applications.push(record); saveDB(db);
  const desc=type==='public'
    ? `**Podanie publiczne**\nKandydat: <@${i.user.id}>\n**Wiek:** ${data.wiek}\n**Dane RP:** ${data.dane}\n**Doświadczenie:** ${data.doswiadczenie}\n**Motywacja:** ${data.motywacja}\n**Dyspozycyjność:** ${data.dyspozycyjnosc}`
    : `**Podanie kandydata**\nKandydat: <@${i.user.id}>\n**Pion / stanowisko:** ${data.stanowisko}\n**Znajomość zasad:** ${data.znajomosc}\n**Dyspozycyjność:** ${data.dyspozycyjnosc}\n**Motywacja:** ${data.motywacja}\n**Dodatkowe:** ${data.dodatkowe}`;
  const buttons=new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('zw-app-accept').setLabel(type==='public'?'Przyjmij do kandydatury':'Zatwierdź podanie').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('zw-app-reject').setLabel('Odrzuć').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('zw-app-close').setLabel('Zamknij').setStyle(ButtonStyle.Secondary)
  );
  await ch.send({embeds:[new EmbedBuilder().setTitle(type==='public'?'📋 NOWE PODANIE PUBLICZNE':'🎓 NOWE PODANIE KANDYDATA').setDescription(desc)],components:[buttons]});
  const log=staffChannels(g); if(log) await log.send({embeds:[new EmbedBuilder().setTitle(type==='public'?'📋 NOWE PODANIE PUBLICZNE':'🎓 NOWE PODANIE KANDYDATA').setDescription(`<@${i.user.id}> • ${ch}\nStatus: **OCZEKUJE**`)]}).catch(()=>{});
  return ch;
}

const originalEmit=Client.prototype.emit;
Client.prototype.emit=function(event,...args){
  if(event==='interactionCreate' && args[0]){
    const i=args[0];
    const handled=(i.isChatInputCommand()&&['zw-panel','zw-rekrutacja','zw-egzamin'].includes(i.commandName)) ||
      (i.isButton()&&['zw-public-apply','zw-candidate-apply','zw-app-accept','zw-app-reject','zw-app-close'].includes(i.customId)) ||
      (i.isModalSubmit()&&['zw-public-modal','zw-candidate-modal'].includes(i.customId));
    if(handled){ handle(i).catch(async e=>{console.error(e);if(i.isRepliable()&&!i.replied&&!i.deferred)await i.reply({content:`❌ ${e.message}`,ephemeral:true}).catch(()=>{});}); return true; }
  }
  return originalEmit.call(this,event,...args);
};

async function handle(i){
  const g=i.guild;
  if(i.isChatInputCommand()){
    if(!staff(i)) return i.reply({content:'❌ Brak uprawnień kadry.',ephemeral:true});
    if(i.commandName==='zw-panel'||i.commandName==='zw-rekrutacja'){
      const c=channel(g,'panel-podania'); if(!c) return i.reply({content:'❌ Nie znaleziono kanału panel-podania.',ephemeral:true});
      await c.send(publicPanel()); return i.reply({content:`✅ Panel podania publicznego wysłany na ${c}.`,ephemeral:true});
    }
    if(i.commandName==='zw-egzamin'){
      const c=channel(g,'egzamin-kandydata'); if(!c) return i.reply({content:'❌ Nie znaleziono kanału egzamin-kandydata.',ephemeral:true});
      await c.send(candidatePanel()); return i.reply({content:`✅ Zamiast egzaminu opublikowano panel **podania kandydata** na ${c}.`,ephemeral:true});
    }
  }
  if(i.isButton()){
    if(i.customId==='zw-public-apply') return i.showModal(modalPublic());
    if(i.customId==='zw-candidate-apply'){
      const r=candidateRole(g); if(!r||!i.member.roles.cache.has(r.id)) return i.reply({content:'❌ To podanie jest dostępne tylko dla roli 🎓 Kandydat ŻW.',ephemeral:true});
      return i.showModal(modalCandidate());
    }
    if(['zw-app-accept','zw-app-reject'].includes(i.customId)){
      if(!staff(i)) return i.reply({content:'❌ Tylko kadra może podjąć decyzję.',ephemeral:true});
      const db=loadDB(); const a=(db.applications||[]).find(x=>x.channel===i.channel.id); if(!a) return i.reply({content:'❌ Nie znaleziono podania.',ephemeral:true});
      a.status=i.customId==='zw-app-accept'?'PRZYJĘTY':'ODRZUCONY'; a.decidedBy=i.user.id; a.decidedAt=new Date().toISOString();
      if(i.customId==='zw-app-accept'&&a.type==='PUBLICZNE'){
        const r=candidateRole(g); const m=await g.members.fetch(a.user).catch(()=>null); if(r&&m) await m.roles.add(r).catch(()=>{});
      }
      saveDB(db);
      const result=a.status==='PRZYJĘTY'?(a.type==='PUBLICZNE'?'Otrzymujesz rolę **🎓 Kandydat ŻW** i możesz przejść do podania kandydata.':'Podanie kandydata zostało zatwierdzone.'): 'Podanie zostało odrzucone.';
      await i.reply({content:`✅ **${a.status}**\n${result}`,ephemeral:true});
      await i.channel.send({embeds:[new EmbedBuilder().setTitle(`📋 DECYZJA — ${a.status}`).setDescription(`Kandydat: <@${a.user}>\nDecyzja: <@${i.user.id}>`)]}).catch(()=>{});
      return;
    }
    if(i.customId==='zw-app-close'){
      if(!staff(i)) return i.reply({content:'❌ Tylko kadra może zamknąć podanie.',ephemeral:true});
      await i.reply({content:'🔒 Zamykam podanie.',ephemeral:true}); return i.channel.delete().catch(()=>{});
    }
  }
  if(i.isModalSubmit()){
    if(i.customId==='zw-public-modal'){
      const d={wiek:i.fields.getTextInputValue('wiek'),dane:i.fields.getTextInputValue('dane'),doswiadczenie:i.fields.getTextInputValue('doswiadczenie'),motywacja:i.fields.getTextInputValue('motywacja'),dyspozycyjnosc:i.fields.getTextInputValue('dyspozycyjnosc')};
      const c=await makeTicket(i,'public',d); return i.reply({content:`✅ Utworzono podanie publiczne: ${c}`,ephemeral:true});
    }
    if(i.customId==='zw-candidate-modal'){
      const r=candidateRole(g); if(!r||!i.member.roles.cache.has(r.id)) return i.reply({content:'❌ Nie masz roli 🎓 Kandydat ŻW.',ephemeral:true});
      const d={stanowisko:i.fields.getTextInputValue('stanowisko'),znajomosc:i.fields.getTextInputValue('znajomosc'),dyspozycyjnosc:i.fields.getTextInputValue('dyspozycyjnosc'),motywacja:i.fields.getTextInputValue('motywacja'),dodatkowe:i.fields.getTextInputValue('dodatkowe')};
      const c=await makeTicket(i,'candidate',d); return i.reply({content:`✅ Utworzono podanie kandydata: ${c}`,ephemeral:true});
    }
  }
}
