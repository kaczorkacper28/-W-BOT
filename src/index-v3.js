require('dotenv').config();
const {
  Client, GatewayIntentBits, PermissionsBitField, ChannelType, REST, Routes,
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');
const db = require('./database');

const { TOKEN, CLIENT_ID, GUILD_ID, STAFF_ROLE_IDS, LOG_CHANNEL_ID } = process.env;
if (!TOKEN || !CLIENT_ID || !GUILD_ID) throw new Error('Brak TOKEN, CLIENT_ID lub GUILD_ID w .env');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const P = PermissionsBitField.Flags;
const staffRoleIds = (STAFF_ROLE_IDS || '').split(',').map(x => x.trim()).filter(Boolean);

// Bot NIE tworzy ról ani kanałów. Korzysta wyłącznie z istniejącej struktury serwera.
const CATEGORY = {
  PUBLIC: '🎓 REKRUTACJA — PUBLICZNA',
  CANDIDATE: '🎓 REKRUTACJA — KANDYDAT',
  STAFF: '🔒 REKRUTACJA — KADRA'
};

const CHANNEL = {
  CONTACT: '🎫・kontakt',
  APPLICATION_PANEL: '📋・panel-podania',
  REQUIREMENTS: '📚・wymagania-rekrutacji',
  INTERNAL_APPLICATIONS: '📝・podania-wewnętrzne',
  RECRUITMENT_RESULTS: '📊・wyniki-rekrutacji',
  CANDIDATE_EXAM: '🎓・egzamin-kandydata',
  RECRUITMENT_STATUS: '📊・status-rekrutacji'
};

const QUESTIONS = [
  ['Jaki jest podstawowy cel Żandarmerii Wojskowej?', ['Zapewnianie przestrzegania dyscypliny wojskowej', 'Prowadzenie wyłącznie szkoleń sportowych', 'Obsługa administracji cywilnej', 'Kontrola ruchu lotniczego'], 0],
  ['Gdzie ŻW może realizować zadania związane z ochroną porządku?', ['Tylko poza jednostkami', 'Na terenach i obiektach wojskowych oraz w miejscach publicznych w zakresie określonym prawem', 'Wyłącznie w koszarach', 'Tylko podczas wojny'], 1],
  ['Jak należy wykonywać polecenia przełożonego w RP?', ['Ignorować', 'Zgodnie z regulaminem i zasadami RP', 'Publikować publicznie', 'Przekazywać przypadkowym osobom'], 1],
  ['Co oznacza skrót RP?', ['Real Play', 'RolePlay', 'Rapid Patrol', 'Regulamin Personalny'], 1],
  ['Jak należy zachować się podczas kontroli RP?', ['Prowokować', 'Zachować kulturę, opanowanie i działać według procedury', 'Odmówić przedstawienia się bez powodu', 'Opuścić miejsce bez powodu'], 1],
  ['Czy informacje kadrowe wolno przekazywać osobom nieuprawnionym?', ['Tak', 'Nie', 'Tylko poza Discordem', 'Zawsze podczas patrolu'], 1],
  ['Jaki powinien być komunikat radiowy?', ['Chaotyczny i bardzo długi', 'Krótki, jasny i rzeczowy', 'Same emotikony', 'Bez identyfikacji'], 1],
  ['Co najlepiej opisuje dyscyplinę służbową?', ['Wykonywanie tylko łatwych zadań', 'Przestrzeganie poleceń, regulaminów i zasad służby', 'Brak odpowiedzialności', 'Wyłącznie noszenie munduru'], 1],
  ['Co zrobić, gdy sytuacja przekracza możliwości patrolu?', ['Udawać, że nic się nie stało', 'Wezwać wsparcie i przekazać rzeczowy meldunek', 'Opuścić serwer', 'Usunąć dowody'], 1],
  ['Jak kandydat powinien zachować się podczas egzaminu?', ['Korzystać z podpowiedzi', 'Samodzielnie i uczciwie odpowiadać', 'Spamować', 'Ignorować egzaminatora'], 1]
];

const commands = [
  new SlashCommandBuilder().setName('zw-panel').setDescription('Publikuje panel rekrutacyjny ŻW w istniejącym kanale.'),
  new SlashCommandBuilder().setName('zw-zamknij').setDescription('Zamyka aktualny ticket ŻW.'),
  new SlashCommandBuilder().setName('zw-podania').setDescription('Pokazuje liczbę oczekujących podań.'),
  new SlashCommandBuilder().setName('zw-egzaminy').setDescription('Pokazuje statystyki egzaminów.')
].map(x => x.toJSON());

const isStaff = member => member?.permissions?.has(P.Administrator) || staffRoleIds.some(id => member?.roles?.cache?.has(id));
const isTicket = channel => channel?.topic?.startsWith('ZW-TICKET:');
const slug = value => String(value).toLowerCase().replace(/[^a-z0-9_-]/gi, '-').slice(0, 55) || 'kandydat';

function findCategory(guild, name) {
  return guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === name) || null;
}

function findChannel(guild, name) {
  return guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name === name) || null;
}

async function sendLog(guild, title, description) {
  if (!LOG_CHANNEL_ID) return;
  const channel = guild.channels.cache.get(LOG_CHANNEL_ID);
  if (channel?.isTextBased()) {
    await channel.send({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(title).setDescription(description).setTimestamp()] }).catch(() => {});
  }
}

function recruitmentPanel() {
  return {
    embeds: [new EmbedBuilder()
      .setColor(0x111827)
      .setTitle('🇵🇱 ŻANDARMERIA WOJSKOWA — REKRUTACJA')
      .setDescription(
        'Witaj w systemie rekrutacji Żandarmerii Wojskowej.\n\n' +
        '🎓 **ZŁÓŻ PODANIE**\nOtwiera prywatny ticket rekrutacyjny, w którym wypełnisz formularz.\n\n' +
        '📝 **EGZAMIN**\nOtwiera prywatny ticket z automatycznym egzaminem.\n\n' +
        '🔒 Ticket widzi kandydat oraz uprawniona kadra.\n' +
        '⚠️ Nie otwieraj kilku ticketów tego samego typu.'
      )],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('new_app').setLabel('Złóż podanie').setEmoji('🎓').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('new_exam').setLabel('Egzamin').setEmoji('📝').setStyle(ButtonStyle.Success)
    )]
  };
}

async function createTicket(interaction, type) {
  const category = findCategory(interaction.guild, CATEGORY.CANDIDATE);
  if (!category) {
    return interaction.reply({ content: `❌ Nie znaleziono istniejącej kategorii **${CATEGORY.CANDIDATE}**. Bot nie tworzy kategorii automatycznie.`, ephemeral: true });
  }

  const topic = `ZW-TICKET:${type}:${interaction.user.id}`;
  const existing = interaction.guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.topic === topic);
  if (existing) return interaction.reply({ content: `❌ Masz już otwarty ticket: ${existing}`, ephemeral: true });

  const overwrites = [
    { id: interaction.guild.roles.everyone.id, deny: [P.ViewChannel] },
    { id: interaction.user.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory] }
  ];

  for (const roleId of staffRoleIds) {
    overwrites.push({ id: roleId, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.ManageMessages] });
  }

  if (interaction.guild.members.me) {
    overwrites.push({
      id: interaction.guild.members.me.id,
      allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.ManageChannels, P.ManageMessages]
    });
  }

  const channel = await interaction.guild.channels.create({
    name: `${type === 'exam' ? 'egzamin' : 'podanie'}-${slug(interaction.user.username)}`,
    type: ChannelType.GuildText,
    parent: category.id,
    topic,
    permissionOverwrites: overwrites
  });

  await interaction.reply({ content: `✅ Ticket utworzony: ${channel}`, ephemeral: true });

  if (type === 'application') {
    const modal = new ModalBuilder().setCustomId(`app:${channel.id}`).setTitle('Podanie do Żandarmerii Wojskowej');
    const fields = [
      ['wiek', 'Wiek', 'Wiek postaci', TextInputStyle.Short],
      ['dane', 'Imię i nazwisko RP', 'Dane postaci', TextInputStyle.Short],
      ['exp', 'Doświadczenie', 'Doświadczenie RP / służbowe', TextInputStyle.Paragraph],
      ['mot', 'Motywacja', 'Dlaczego chcesz dołączyć do ŻW?', TextInputStyle.Paragraph],
      ['czas', 'Dyspozycyjność', 'Kiedy możesz pełnić służbę?', TextInputStyle.Paragraph]
    ];
    modal.addComponents(...fields.map(([id, label, placeholder, style]) =>
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId(id).setLabel(label).setPlaceholder(placeholder).setStyle(style).setRequired(true).setMaxLength(1000)
      )
    ));
    return interaction.followUp({ content: '📋 Wypełnij formularz podania.', ephemeral: true }).then(() => interaction.showModal(modal)).catch(() => {});
  }

  await channel.send({
    content: `<@${interaction.user.id}>`,
    embeds: [new EmbedBuilder()
      .setColor(0x22c55e)
      .setTitle('📝 EGZAMIN ŻW')
      .setDescription('Egzamin składa się z **10 pytań**.\nMinimum zaliczenia: **70%**.\n\nOdpowiadaj samodzielnie i uczciwie.')],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('exam_start').setLabel('Rozpocznij egzamin').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('close').setLabel('Zamknij ticket').setStyle(ButtonStyle.Danger)
    )]
  });
  await sendLog(interaction.guild, '🎫 Nowy ticket egzaminacyjny', `${interaction.user} → ${channel}`);
}

async function sendQuestion(channel, userId, number) {
  const q = QUESTIONS[number];
  const row = new ActionRowBuilder();
  q[1].forEach((answer, index) => {
    row.addComponents(new ButtonBuilder()
      .setCustomId(`ans:${index}`)
      .setLabel(`${String.fromCharCode(65 + index)}. ${answer}`.slice(0, 80))
      .setStyle(ButtonStyle.Secondary));
  });
  await channel.send({
    content: `<@${userId}>`,
    embeds: [new EmbedBuilder().setColor(0x22c55e).setTitle(`📝 EGZAMIN ŻW • ${number + 1}/${QUESTIONS.length}`).setDescription(q[0])],
    components: [row]
  });
}

async function answerExam(interaction, answerIndex) {
  const exam = db.getExam(interaction.user.id);
  if (!exam || exam.channelId !== interaction.channel.id || exam.status !== 'W_TRAKCIE') {
    return interaction.reply({ content: '❌ Nie masz aktywnego egzaminu w tym tickecie.', ephemeral: true });
  }

  const question = QUESTIONS[exam.question];
  const score = exam.score + (answerIndex === question[2] ? 1 : 0);
  const next = exam.question + 1;

  if (next >= QUESTIONS.length) {
    const percent = Math.round((score / QUESTIONS.length) * 100);
    const passed = percent >= 70;
    db.updateExam(interaction.user.id, {
      question: next,
      score,
      status: 'ZAKOŃCZONY',
      percent,
      automaticResult: passed ? 'ZDAŁ' : 'NIE ZDAŁ',
      finishedAt: new Date().toISOString()
    });

    await interaction.update({
      content: '',
      embeds: [new EmbedBuilder()
        .setColor(passed ? 0x22c55e : 0xef4444)
        .setTitle('🎓 EGZAMIN ZAKOŃCZONY')
        .setDescription(
          `Kandydat: <@${interaction.user.id}>\n` +
          `Wynik: **${score}/${QUESTIONS.length} (${percent}%)**\n` +
          `Minimum: **70%**\n` +
          `Wynik automatyczny: **${passed ? 'ZDAŁ' : 'NIE ZDAŁ'}**\n\n` +
          'Kadra może teraz zatwierdzić albo odrzucić wynik.'
        )],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`accept:${interaction.user.id}`).setLabel('Zatwierdź wynik').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`reject:${interaction.user.id}`).setLabel('Odrzuć wynik').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('close').setLabel('Zamknij').setStyle(ButtonStyle.Secondary)
      )]
    });

    const results = findChannel(interaction.guild, CHANNEL.RECRUITMENT_RESULTS);
    if (results) await results.send(`🎓 **Wynik egzaminu:** <@${interaction.user.id}> — **${score}/${QUESTIONS.length} (${percent}%)** — **${passed ? 'ZDAŁ' : 'NIE ZDAŁ'}**`).catch(() => {});
    return sendLog(interaction.guild, '🎓 Egzamin zakończony', `${interaction.user} — ${score}/${QUESTIONS.length} (${percent}%)`);
  }

  db.updateExam(interaction.user.id, { question: next, score });
  await interaction.update({ content: `✅ Odpowiedź zapisana. Wynik: **${score}/${next}**`, embeds: [], components: [] });
  setTimeout(() => sendQuestion(interaction.channel, interaction.user.id, next), 500);
}

async function closeTicket(channel, reason) {
  await channel.send({ embeds: [new EmbedBuilder().setColor(0xef4444).setTitle('🔒 Ticket zamknięty').setDescription(reason).setTimestamp()] }).catch(() => {});
  setTimeout(() => channel.delete('ŻW BOT — zamknięcie ticketu').catch(() => {}), 2000);
}

client.once('ready', async () => {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  console.log(`ŻW BOT online: ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'zw-panel') {
        if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ Brak uprawnień.', ephemeral: true });
        const channel = findChannel(interaction.guild, CHANNEL.APPLICATION_PANEL) || findChannel(interaction.guild, CHANNEL.CONTACT);
        if (!channel) return interaction.reply({ content: `❌ Nie znaleziono istniejącego kanału **${CHANNEL.APPLICATION_PANEL}** ani **${CHANNEL.CONTACT}**.`, ephemeral: true });
        await channel.send(recruitmentPanel());
        return interaction.reply({ content: `✅ Panel wysłany na ${channel}.`, ephemeral: true });
      }

      if (interaction.commandName === 'zw-zamknij') {
        if (!isStaff(interaction.member) || !isTicket(interaction.channel)) return interaction.reply({ content: '❌ Brak uprawnień lub to nie jest ticket ŻW.', ephemeral: true });
        await interaction.reply('🔒 Zamykam ticket…');
        return closeTicket(interaction.channel, `Zamknięte przez ${interaction.user.tag}`);
      }

      if (interaction.commandName === 'zw-podania') {
        if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ Brak uprawnień.', ephemeral: true });
        return interaction.reply({ content: `📋 Oczekujące podania: **${db.allApplications().filter(x => x.status === 'NOWE').length}**`, ephemeral: true });
      }

      if (interaction.commandName === 'zw-egzaminy') {
        if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ Brak uprawnień.', ephemeral: true });
        const all = db.allExams();
        return interaction.reply({ content: `🎓 Egzaminy: **${all.length}** | Zakończone: **${all.filter(x => x.status === 'ZAKOŃCZONY' || x.status === 'ZALICZONY' || x.status === 'NIEZALICZONY').length}**`, ephemeral: true });
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId === 'new_app') return createTicket(interaction, 'application');
      if (interaction.customId === 'new_exam') return createTicket(interaction, 'exam');

      if (interaction.customId === 'close') {
        if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ Tylko kadra może zamknąć ticket.', ephemeral: true });
        await interaction.reply('🔒 Zamykam ticket…');
        return closeTicket(interaction.channel, `Zamknięte przez ${interaction.user.tag}`);
      }

      if (interaction.customId === 'exam_start') {
        if (interaction.channel?.topic !== `ZW-TICKET:exam:${interaction.user.id}`) return interaction.reply({ content: '❌ Tylko właściciel tego ticketu może rozpocząć egzamin.', ephemeral: true });
        if (db.getExam(interaction.user.id)?.status === 'W_TRAKCIE') return interaction.reply({ content: '❌ Egzamin już trwa.', ephemeral: true });
        db.createExam(interaction.user.id, {
          discordId: interaction.user.id,
          channelId: interaction.channel.id,
          question: 0,
          score: 0,
          status: 'W_TRAKCIE',
          answers: [],
          startedAt: new Date().toISOString()
        });
        await interaction.reply({ content: '▶️ Egzamin rozpoczęty.', ephemeral: true });
        return sendQuestion(interaction.channel, interaction.user.id, 0);
      }

      if (interaction.customId.startsWith('ans:')) return answerExam(interaction, Number(interaction.customId.split(':')[1]));

      if (interaction.customId.startsWith('accept:') || interaction.customId.startsWith('reject:')) {
        if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ Tylko kadra.', ephemeral: true });
        const id = interaction.customId.split(':')[1];
        const accepted = interaction.customId.startsWith('accept:');
        db.updateExam(id, { status: accepted ? 'ZALICZONY' : 'NIEZALICZONY', reviewedBy: interaction.user.id, reviewedAt: new Date().toISOString() });
        await interaction.reply(accepted ? '✅ Wynik egzaminu zatwierdzony.' : '❌ Wynik egzaminu odrzucony.');
        return sendLog(interaction.guild, '🎓 Decyzja egzaminacyjna', `Kandydat: <@${id}>\nDecyzja: **${accepted ? 'ZALICZONY' : 'NIEZALICZONY'}**\nKadra: ${interaction.user}`);
      }

      if (interaction.customId.startsWith('app_accept:') || interaction.customId.startsWith('app_reject:')) {
        if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ Tylko kadra.', ephemeral: true });
        const id = interaction.customId.split(':')[1];
        const accepted = interaction.customId.startsWith('app_accept:');
        db.updateApplication(id, { status: accepted ? 'PRZYJĘTE' : 'ODRZUCONE', reviewedBy: interaction.user.id, reviewedAt: new Date().toISOString() });
        await interaction.reply(accepted ? '✅ Podanie przyjęte.' : '❌ Podanie odrzucone.');
        return sendLog(interaction.guild, '📋 Decyzja w sprawie podania', `Kandydat: <@${id}>\nDecyzja: **${accepted ? 'PRZYJĘTE' : 'ODRZUCONE'}**\nKadra: ${interaction.user}`);
      }
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('app:')) {
      const channelId = interaction.customId.split(':')[1];
      const channel = interaction.guild.channels.cache.get(channelId);
      if (!channel || channel.topic !== `ZW-TICKET:application:${interaction.user.id}`) return interaction.reply({ content: '❌ Nieprawidłowy ticket podania.', ephemeral: true });

      const application = {
        discordId: interaction.user.id,
        channelId,
        age: interaction.fields.getTextInputValue('wiek'),
        name: interaction.fields.getTextInputValue('dane'),
        experience: interaction.fields.getTextInputValue('exp'),
        motivation: interaction.fields.getTextInputValue('mot'),
        availability: interaction.fields.getTextInputValue('czas'),
        status: 'NOWE',
        createdAt: new Date().toISOString()
      };

      db.createApplication(interaction.user.id, application);

      const embed = new EmbedBuilder()
        .setColor(0x3b82f6)
        .setTitle('📋 PODANIE — ŻANDARMERIA WOJSKOWA')
        .addFields(
          { name: 'Kandydat', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Wiek', value: application.age, inline: true },
          { name: 'Imię i nazwisko RP', value: application.name },
          { name: 'Doświadczenie', value: application.experience.slice(0, 1024) },
          { name: 'Motywacja', value: application.motivation.slice(0, 1024) },
          { name: 'Dyspozycyjność', value: application.availability.slice(0, 1024) }
        )
        .setTimestamp();

      await interaction.reply({ content: '✅ Podanie zapisane. Oczekuj na decyzję kadry.', ephemeral: true });

      await channel.send({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`app_accept:${interaction.user.id}`).setLabel('Przyjmij').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`app_reject:${interaction.user.id}`).setLabel('Odrzuć').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('close').setLabel('Zamknij').setStyle(ButtonStyle.Secondary)
        )]
      });

      const internal = findChannel(interaction.guild, CHANNEL.INTERNAL_APPLICATIONS);
      if (internal) await internal.send(`📋 Nowe podanie od <@${interaction.user.id}> — ticket: ${channel}`).catch(() => {});
      await sendLog(interaction.guild, '📝 Nowe podanie ŻW', `Kandydat: ${interaction.user}`);
    }
  } catch (error) {
    console.error(error);
    if (!interaction.replied && !interaction.deferred) interaction.reply({ content: '❌ Wystąpił błąd bota. Sprawdź logi.', ephemeral: true }).catch(() => {});
  }
});

client.login(TOKEN);