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
    const supportRoleId = '1317880168446038056';
    // Pega o username do usuário, removendo espaços e caracteres especiais para nome do canal
    const username = interaction.user.username.replace(/[^a-zA-Z0-9-_]/g, '').toLowerCase();
    
    // Verifica se o cargo existe
    const supportRole = interaction.guild.roles.cache.get(supportRoleId);
    if (!supportRole) {
      await interaction.reply({ content: '⚠️ Erro: O cargo de suporte não foi encontrado no servidor.', ephemeral: true });
      return;
    }
    
    const channel = await interaction.guild.channels.create({
      name: `🎫・hp-@${username}`,
      type: ChannelType.GuildText,
      parent: category ? category.id : null,
      topic: `TICKET_USER:${interaction.user.id}`,
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
          id: supportRoleId,
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
    await channel.send({ content: `<@${interaction.user.id}> <@&${supportRoleId}>`, embeds: [embed], components: [row] });
    await interaction.reply({ content: `Seu ticket foi criado: ${channel}`, ephemeral: true });
    return;
  }
  // FECHAR TICKET: mostrar modal para motivo de fechamento
  if (interaction.isButton() && interaction.customId === 'close_ticket') {
    const channel = interaction.channel;
    // Verifica se o usuário tem o cargo correto
    const allowedRole = '1317880168446038056';
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member.roles.cache.has(allowedRole)) {
      await interaction.reply({ content: '❌ Você não tem permissão para fechar este ticket. Apenas membros com o cargo correto podem usar este botão.', ephemeral: true });
      return;
    }
    if (!channel.topic || !channel.topic.startsWith('TICKET_USER:')) {
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
    if (!channel.topic || !channel.topic.startsWith('TICKET_USER:')) {
      if (interaction.deferred || interaction.replied) return;
      await interaction.reply({ content: '⚠️ Este botão só pode ser usado dentro de um canal de ticket.', ephemeral: true });
      return;
    }
    await interaction.reply({ content: '⏳ Salvando e finalizando o ticket... Gerando transcript detalhado para registro. Por favor, aguarde.', ephemeral: true });
    // Busca mensagens do canal
    const messages = await channel.messages.fetch({ limit: 100 });
    const sorted = Array.from(messages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    // Dados do ticket
    const donoTicket = channel.permissionOverwrites.cache.find(po => po.allow.has(PermissionsBitField.Flags.ViewChannel) && po.id !== '1317880168446038056' && po.id !== channel.guild.id);
    const donoUser = donoTicket ? await channel.guild.members.fetch(donoTicket.id).catch(() => null) : null;
    const donoTag = donoUser ? donoUser.user.tag : 'Desconhecido';
    const donoMention = donoUser ? `<@${donoUser.user.id}>` : 'Desconhecido';
    const canalNome = channel.name;
    const dataGeracao = new Date().toLocaleString('pt-BR');
    // Transcript HTML moderno
    let html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Transcript do Ticket - ${canalNome}</title>
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Roboto', Arial, sans-serif; background: #181c23; color: #e6e6e6; margin: 0; padding: 0; }
    .header { background: linear-gradient(90deg, #00c3ff 0%, #1abc9c 100%); color: #fff; padding: 32px 0 16px 0; text-align: center; }
    .header img { width: 80px; margin-bottom: 8px; }
    .header h1 { margin: 0; font-size: 2.2em; letter-spacing: 1px; }
    .header p { margin: 8px 0 0 0; font-size: 1.1em; }
    .info-bar { display: flex; flex-wrap: wrap; justify-content: center; gap: 18px; margin: 24px 0 32px 0; }
    .info-box { background: #23272f; border-radius: 8px; padding: 12px 24px; font-size: 1.05em; box-shadow: 0 2px 8px #0002; }
    .messages { max-width: 900px; margin: 0 auto; }
    .msg-card { background: #23272f; border-left: 5px solid #1abc9c; margin-bottom: 18px; border-radius: 8px; box-shadow: 0 2px 8px #0002; padding: 16px 22px; }
    .msg-header { display: flex; align-items: center; margin-bottom: 6px; }
    .msg-author { font-weight: bold; color: #00c3ff; margin-right: 10px; }
    .msg-time { color: #aaa; font-size: 0.98em; }
    .msg-content { margin-top: 4px; white-space: pre-line; }
    .footer { margin: 40px 0 0 0; text-align: center; color: #aaa; font-size: 1em; }
    .motivo { background: #1abc9c22; border-left: 4px solid #1abc9c; padding: 10px 18px; margin-bottom: 18px; border-radius: 6px; color: #1abc9c; font-weight: bold; }
  </style>
</head>
<body>
  <div class="header">
    <img src="https://cdn.discordapp.com/icons/${channel.guild.id}/${channel.guild.icon}.png" alt="Logo" />
    <h1>Transcript do Ticket</h1>
    <p>Registro completo da conversa deste ticket.</p>
  </div>
  <div class="info-bar">
    <div class="info-box">Canal: <b>${canalNome}</b></div>
    <div class="info-box">Dono: ${donoMention}</div>
    <div class="info-box">Data de Geração: ${dataGeracao}</div>
    <div class="info-box">Total de Mensagens: ${sorted.length}</div>
  </div>
  <div class="motivo">Motivo do fechamento: ${motivoFechamento}</div>
  <div class="messages">`;
    for (const msg of sorted) {
      html += `<div class='msg-card'><div class='msg-header'><span class='msg-author'>${msg.author.tag}</span><span class='msg-time'>${new Date(msg.createdTimestamp).toLocaleString('pt-BR')}</span></div><div class='msg-content'>${msg.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div></div>`;
    }
    html += `</div><div class='footer'>Transcript gerado automaticamente pelo sistema de tickets - Centro Médico Street</div></body></html>`;
    // Salva transcript temporariamente
    const fileName = `transcript-${channel.name}.html`;
    fs.writeFileSync(fileName, html);
    // Envia transcript para canal de transcripts
    const transcriptChannel = interaction.guild.channels.cache.get(process.env.TRANSCRIPT_CHANNEL_ID || config.transcriptChannelId);
    if (transcriptChannel) {
      // Embed de fechamento profissional
      const embed = new EmbedBuilder()
        .setTitle('📋 Log de Ticket - Fechado')
        .setDescription('O ticket foi encerrado e o histórico completo está disponível no arquivo em anexo.')
        .addFields(
          { name: 'Fechado por', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
          { name: 'Dono do Ticket', value: `${donoMention} (${donoTag})`, inline: true },
          { name: 'Canal', value: `${canalNome}`, inline: true },
          { name: 'Motivo', value: motivoFechamento, inline: false }
        )
        .setColor(0x1abc9c)
        .setFooter({ text: 'StreetCarClub • Sistema de Tickets', iconURL: interaction.guild.iconURL() })
        .setTimestamp();
      await transcriptChannel.send({ embeds: [embed], files: [fileName] });
    }
    // Remove arquivo temporário
    fs.unlinkSync(fileName);
    // Deleta o canal do ticket
    setTimeout(() => channel.delete('Ticket fechado'), 2000);
    return;
  }
});

client.login(process.env.DISCORD_TOKEN); 