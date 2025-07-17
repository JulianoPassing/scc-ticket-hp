import { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType } from 'discord.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import config from './config.json' with { type: 'json' };

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
      .setTitle('🎫 Central de Atendimento - Centro Médico Street')
      .setDescription('Bem-vindo ao suporte do Centro Médico Street!\n\nClique no botão abaixo para abrir um ticket e receber atendimento personalizado da nossa equipe.\n\n> **Atenção:** Apenas a equipe de suporte terá acesso ao seu ticket.\n\nSeja claro e objetivo ao descrever sua solicitação para agilizar o atendimento.')
      .setColor(0x1abc9c)
      .setThumbnail(client.user.displayAvatarURL())
      .setFooter({ text: 'Sistema de Tickets • Centro Médico Street', iconURL: client.user.displayAvatarURL() });

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
      name: `🎫・hp-@${username}`,
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
    if (!channel.name.includes('hp-@')) {
      if (interaction.deferred || interaction.replied) return;
      await interaction.reply({ content: '⚠️ Este botão só pode ser usado dentro de um canal de ticket.', ephemeral: true });
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
    if (!channel.name.includes('hp-@')) {
      if (interaction.deferred || interaction.replied) return;
      await interaction.reply({ content: '⚠️ Este botão só pode ser usado dentro de um canal de ticket.', ephemeral: true });
      return;
    }
    await interaction.reply({ content: '⏳ Salvando e finalizando o ticket... Gerando transcript detalhado para registro. Por favor, aguarde.', ephemeral: true });
    // Busca mensagens do canal
    const messages = await channel.messages.fetch({ limit: 100 });
    const sorted = Array.from(messages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    // Gera transcript em HTML estilizado
    let html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Transcript do Ticket - ${channel.name}</title>
  <style>
    body { font-family: Arial, sans-serif; background: #f4f6fa; color: #222; margin: 0; padding: 24px; }
    .header { background: #2ecc71; color: #fff; padding: 16px 24px; border-radius: 8px 8px 0 0; }
    .ticket-info { margin: 16px 0 24px 0; font-size: 1.1em; }
    ul { list-style: none; padding: 0; }
    li { background: #fff; margin-bottom: 12px; border-radius: 6px; box-shadow: 0 1px 3px #0001; padding: 12px 18px; }
    .author { font-weight: bold; color: #2980b9; }
    .timestamp { color: #888; font-size: 0.95em; margin-left: 8px; }
    .motivo { background: #eafaf1; border-left: 4px solid #2ecc71; padding: 8px 14px; margin-bottom: 18px; border-radius: 4px; }
    .footer { margin-top: 32px; color: #888; font-size: 0.95em; text-align: right; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Transcript do Ticket</h1>
    <div class="ticket-info">Canal: <b>${channel.name}</b></div>
  </div>
  <div class="motivo"><b>Motivo do fechamento:</b> ${motivoFechamento}</div>
  <ul>`;
    for (const msg of sorted) {
      html += `<li><span class='author'>${msg.author.tag}</span> <span class='timestamp'>[${new Date(msg.createdTimestamp).toLocaleString('pt-BR')}]</span><br>${msg.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</li>`;
    }
    html += `</ul><div class='footer'>Transcript gerado automaticamente pelo sistema de tickets - Centro Médico Street</div></body></html>`;
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