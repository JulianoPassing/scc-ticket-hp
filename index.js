import { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType } from 'discord.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import config from './config.json' assert { type: 'json' };

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember, Partials.User]
});

client.once('ready', () => {
  console.log(`Bot online como ${client.user.tag}`);
});

// Comando para enviar o painel de tickets (exemplo: !painel)
client.on('messageCreate', async (message) => {
  if (message.content === '!painel' && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    const embed = new EmbedBuilder()
      .setTitle('🎫 Abrir Ticket - Centro Médico Street')
      .setDescription('Clique no botão abaixo para abrir um ticket com a equipe de suporte.\n\nApenas a equipe de suporte tera acesso ao canal.')
      .setColor(0x2ecc71)
      .setFooter({ text: 'Centro Médico Street', iconURL: client.user.displayAvatarURL() });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('open_ticket')
        .setLabel('Abrir Ticket')
        .setEmoji('🎟️')
        .setStyle(ButtonStyle.Success)
    );

    await message.channel.send({ embeds: [embed], components: [row] });
  }
});

// Lógica de abertura de ticket
client.on('interactionCreate', async (interaction) => {
  // ABRIR TICKET: mostrar modal para motivo
  if (interaction.isButton() && interaction.customId === 'open_ticket') {
    const existing = interaction.guild.channels.cache.find(
      c => c.name === `ticket-${interaction.user.id}`
    );
    if (existing) {
      await interaction.reply({ content: 'Você já possui um ticket aberto!', ephemeral: true });
      return;
    }
    // Mostra modal para motivo
    const modal = new ModalBuilder()
      .setCustomId('modal_motivo_ticket')
      .setTitle('Motivo do Ticket');
    const motivoInput = new TextInputBuilder()
      .setCustomId('motivo_ticket')
      .setLabel('Descreva o motivo do seu ticket')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(motivoInput));
    await interaction.showModal(modal);
    return;
  }
  // RECEBE MODAL DE MOTIVO DE ABERTURA
  if (interaction.type === InteractionType.ModalSubmit && interaction.customId === 'modal_motivo_ticket') {
    const motivo = interaction.fields.getTextInputValue('motivo_ticket');
    const existing = interaction.guild.channels.cache.find(
      c => c.name === `ticket-${interaction.user.id}`
    );
    if (existing) {
      await interaction.reply({ content: 'Você já possui um ticket aberto!', ephemeral: true });
      return;
    }
    // Cria o canal do ticket
    const category = interaction.guild.channels.cache.get(process.env.TICKET_CATEGORY_ID || config.ticketCategoryId);
    const supportRole = '1277734174635196581';
    // Pega o username do usuário, removendo espaços e caracteres especiais para nome do canal
    const username = interaction.user.username.replace(/[^a-zA-Z0-9-_]/g, '').toLowerCase();
    const channel = await interaction.guild.channels.create({
      name: `ticket-${username}`,
      type: ChannelType.GuildText,
      parent: category ? category.id : null,
      permissionOverwrites: [
        {
          id: interaction.guild.id,
          deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
          id: interaction.user.id,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
        },
        {
          id: supportRole,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
        }
      ]
    });
    // Mensagem de boas-vindas e botão para fechar
    const embed = new EmbedBuilder()
      .setTitle('🩺 Suporte Centro Médico Street')
      .setDescription(`Olá <@${interaction.user.id}>, descreva sua solicitação e a equipe irá te atender em breve!\n\n**Motivo:** ${motivo}`)
      .setColor(0x3498db)
      .setFooter({ text: 'Para fechar o ticket, clique no botão abaixo.' });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('close_ticket')
        .setLabel('Fechar Ticket')
        .setEmoji('🔒')
        .setStyle(ButtonStyle.Danger)
    );
    await channel.send({ content: `<@${interaction.user.id}> <@&${supportRole}>`, embeds: [embed], components: [row] });
    await interaction.reply({ content: `Seu ticket foi criado: ${channel}`, ephemeral: true });
    return;
  }
  // FECHAR TICKET: mostrar modal para motivo de fechamento
  if (interaction.isButton() && interaction.customId === 'close_ticket') {
    const channel = interaction.channel;
    if (!channel.name.startsWith('ticket-')) {
      await interaction.reply({ content: 'Este comando só pode ser usado em canais de ticket.', ephemeral: true });
      return;
    }
    // Mostra modal para motivo de fechamento
    const modal = new ModalBuilder()
      .setCustomId('modal_motivo_fechamento')
      .setTitle('Motivo do Fechamento');
    const motivoInput = new TextInputBuilder()
      .setCustomId('motivo_fechamento')
      .setLabel('Por que está fechando o ticket?')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(motivoInput));
    await interaction.showModal(modal);
    return;
  }
  // RECEBE MODAL DE MOTIVO DE FECHAMENTO
  if (interaction.type === InteractionType.ModalSubmit && interaction.customId === 'modal_motivo_fechamento') {
    const motivoFechamento = interaction.fields.getTextInputValue('motivo_fechamento');
    const channel = interaction.channel;
    if (!channel.name.startsWith('ticket-')) {
      await interaction.reply({ content: 'Este comando só pode ser usado em canais de ticket.', ephemeral: true });
      return;
    }
    await interaction.reply({ content: 'Fechando ticket e gerando transcript...', ephemeral: true });
    // Busca mensagens do canal
    const messages = await channel.messages.fetch({ limit: 100 });
    const sorted = Array.from(messages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    // Gera transcript em HTML
    let html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Transcript Ticket</title></head><body><h2>Transcript do Ticket: ${channel.name}</h2><ul>`;
    for (const msg of sorted) {
      html += `<li><b>${msg.author.tag}</b> [${new Date(msg.createdTimestamp).toLocaleString('pt-BR')}]<br>${msg.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</li>`;
    }
    html += `</ul><p><b>Motivo do fechamento:</b> ${motivoFechamento}</p></body></html>`;
    // Salva transcript temporariamente
    const fileName = `transcript-${channel.name}.html`;
    fs.writeFileSync(fileName, html);
    // Envia transcript para canal de transcripts
    const transcriptChannel = interaction.guild.channels.cache.get(process.env.TRANSCRIPT_CHANNEL_ID || config.transcriptChannelId);
    if (transcriptChannel) {
      await transcriptChannel.send({ files: [fileName], content: `Transcript do ${channel.name}` });
    }
    // Remove arquivo temporário
    fs.unlinkSync(fileName);
    // Deleta o canal do ticket
    setTimeout(() => channel.delete('Ticket fechado'), 2000);
    return;
  }
});

client.login(process.env.DISCORD_TOKEN); 