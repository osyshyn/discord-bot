require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  // Removed InteractionResponseFlags import to avoid confusion if not directly exported
} = require("discord.js");

console.log("TOKEN:", .ENV.BOT_TOKEN);

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// Map to store temporary survey data for each user
const userSurveyData = new Map();

client.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "ping") {
      await interaction.reply("pong!!!");
    } else if (interaction.commandName === "begin") {
      // Initialize data for a new survey
      userSurveyData.set(interaction.user.id, {});
      await sendBookDetailsModal(interaction); // Changed to sendBookDetailsModal
    }
  } else if (interaction.isModalSubmit()) {
    if (interaction.customId === "bookDetailsModal") {
      const bookTitle = interaction.fields.getTextInputValue("bookTitleInput");
      const bookLength = interaction.fields.getTextInputValue("bookLengthInput");
      userSurveyData.get(interaction.user.id).bookTitle = bookTitle;
      userSurveyData.get(interaction.user.id).bookLength = bookLength;
      // After modal submit, reply with the next step, do not update the original interaction message
      await sendWritingStyleSelect(interaction);
    }
  } else if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "writingStyleSelect") {
      const writingStyle = interaction.values[0];
      userSurveyData.get(interaction.user.id).writingStyle = writingStyle;
      // After a select menu choice, update that same message or reply with the next step
      await sendDiscordBotModesButtons(interaction);
    } else if (interaction.customId === "bookFormatSelect") {
      const bookFormat = interaction.values[0];
      userSurveyData.get(interaction.user.id).bookFormat = bookFormat;
      // After a select menu choice, update that same message or reply with the next step
      await sendSummaryAndOptions(interaction);
    }
  } else if (interaction.isButton()) {
    if (interaction.customId === "brainstormMode" || interaction.customId === "writerMode") {
      userSurveyData.get(interaction.user.id).discordBotMode = interaction.customId === "brainstormMode" ? "Brainstorm Mode" : "Writer Mode";
      // After a button click, update that same message or reply with the next step
      await sendUserEngagementLevelButtons(interaction);
    } else if (interaction.customId === "lowEngagement" || interaction.customId === "highEngagement") {
      userSurveyData.get(interaction.user.id).userEngagementLevel = interaction.customId === "lowEngagement" ? "Low Engagement Level" : "High Engagement Level";
      // After a button click, update that same message or reply with the next step
      await sendBookFormatSelect(interaction);
    } else if (interaction.customId === "applyButton") {
      const userData = userSurveyData.get(interaction.user.id);
      // When applying, defer the update or just reply
      // Update the message where the buttons are
      await interaction.update({ content: "Sending data...", components: [] }); 
      try {
        const webhookUrl = process.env.WEBHOOK_URL;
        if (!webhookUrl) {
          console.error("WEBHOOK_URL is not set in .env file!");
          // Use followUp here as update might have already happened or failed
          await interaction.followUp({ content: "Error: WEBHOOK_URL is not set. Cannot send data.", ephemeral: true }); // Using ephemeral: true
          return;
        }

        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(userData),
        });

        if (response.ok) {
          const bookFormat = userSurveyData.get(interaction.user.id)?.bookFormat || "pdf";
          const fileName = `book.${bookFormat}`;
          const buffer = await response.arrayBuffer();
          const file = Buffer.from(buffer);

          const attachment = new AttachmentBuilder(file, {
            name: fileName, 
          });

          await interaction.followUp({
            content: "✅ Here is your book",
            files: [attachment],
            ephemeral: true,
          });
          
          userSurveyData.delete(interaction.user.id); // Clear data after sending
        } else {
          await interaction.followUp({ content: `Error sending data: ${response.status} ${response.statusText}`, ephemeral: true }); // Using ephemeral: true
        }
      } catch (error) {
        console.error("Error sending data to webhook:", error);
        await interaction.followUp({ content: "An error occurred while sending data. Please try again.", ephemeral: true }); // Using ephemeral: true
      }
    } else if (interaction.customId === "editButton") {
      // Restart the survey
      userSurveyData.set(interaction.user.id, {});
      // Do not update the message before showing the modal, as showModal is also a response.
      await sendBookDetailsModal(interaction); // Show the modal for re-entry
    }
  }
});

// Functions for each step of the survey
async function sendBookDetailsModal(interaction) { // New function combining book title and length
  const modal = new ModalBuilder()
    .setCustomId("bookDetailsModal")
    .setTitle("Survey: Book Details");

  const bookTitleInput = new TextInputBuilder()
    .setCustomId("bookTitleInput")
    .setLabel("Book Title")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const bookLengthInput = new TextInputBuilder()
    .setCustomId("bookLengthInput")
    .setLabel("Book Length (number of words)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const firstActionRow = new ActionRowBuilder().addComponents(bookTitleInput);
  const secondActionRow = new ActionRowBuilder().addComponents(bookLengthInput); // New row for book length

  modal.addComponents(firstActionRow, secondActionRow); // Add both rows to the modal

  // Directly show the modal for the slash command or button interaction
  await interaction.showModal(modal);
}

async function sendWritingStyleSelect(interaction) {
  const select = new StringSelectMenuBuilder()
    .setCustomId("writingStyleSelect")
    .setPlaceholder("Select a writing style")
    .addOptions([
      {
        label: "Science Fiction",
        description: "Focuses on technology, the future, and space.",
        value: "sci_fi",
      },
      {
        label: "Fantasy",
        description: "Based on magic, mythical creatures, and imaginary worlds.",
        value: "fantasy",
      },
      {
        label: "Mystery/Detective",
        description: "Solving crimes and unraveling secrets.",
        value: "mystery_detective",
      },
      {
        label: "Romance",
        description: "Relationships and emotions between characters.",
        value: "romance",
      },
      {
        label: "Historical",
        description: "Events based on real history.",
        value: "historical",
      },
    ]);

  const row = new ActionRowBuilder().addComponents(select);
  // After a modal submit, you must reply to the interaction, not update a potentially non-existent message.
  await interaction.reply({ content: "Select a writing style:", components: [row], ephemeral: true }); // Using ephemeral: true
}

async function sendDiscordBotModesButtons(interaction) {
  const brainstormButton = new ButtonBuilder()
    .setCustomId("brainstormMode")
    .setLabel("Brainstorm Mode")
    // Primary (blue)
    .setStyle(ButtonStyle.Primary);

  const writerButton = new ButtonBuilder()
    .setCustomId("writerMode")
    .setLabel("Writer Mode")
    // Secondary (grey)
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder().addComponents(brainstormButton, writerButton);
  // Continue updating the same ephemeral message for subsequent steps
  await interaction.update({ content: "Select Discord Bot Mode:", components: [row] });
}

async function sendUserEngagementLevelButtons(interaction) {
  const lowEngagementButton = new ButtonBuilder()
    .setCustomId("lowEngagement")
    .setLabel("Low Engagement Level")
    // Success (green)
    .setStyle(ButtonStyle.Success);

  const highEngagementButton = new ButtonBuilder()
    .setCustomId("highEngagement")
    .setLabel("High Engagement Level")
    // Primary (blue)
    .setStyle(ButtonStyle.Primary); 

  const row = new ActionRowBuilder().addComponents(lowEngagementButton, highEngagementButton);
  // Continue updating the same ephemeral message for subsequent steps
  await interaction.update({ content: "Select User Engagement Level:", components: [row] });
}

async function sendBookFormatSelect(interaction) {
  const select = new StringSelectMenuBuilder()
    .setCustomId("bookFormatSelect")
    .setPlaceholder("Select book format")
    .addOptions([
      {
        label: "DOCX",
        value: "docx",
      },
      {
        label: "PDF",
        value: "pdf",
      },
      {
        label: "EPUB",
        value: "epub",
      },
      {
        label: "MOBI",
        value: "mobi",
      },
    ]);

  const row = new ActionRowBuilder().addComponents(select);
  // Continue updating the same ephemeral message for subsequent steps
  await interaction.update({ content: "Select book format:", components: [row] });
}

async function sendSummaryAndOptions(interaction) {
  const userData = userSurveyData.get(interaction.user.id);
  let summary = "You have selected the following parameters:\n";
  summary += `Book Title: ${userData.bookTitle}\n`;
  summary += `Book Length, words: ${userData.bookLength}\n`;
  summary += `Writing Style: ${userData.writingStyle}\n`;
  summary += `Discord Bot Mode: ${userData.discordBotMode}\n`;
  summary += `User Engagement Level: ${userData.userEngagementLevel}\n`;
  summary += `Book Format: ${userData.bookFormat}\n`;

  const applyButton = new ButtonBuilder()
    .setCustomId("applyButton")
    .setLabel("Apply")
    .setStyle(ButtonStyle.Success); // Green

  const editButton = new ButtonBuilder()
    .setCustomId("editButton")
    .setLabel("Edit")
    .setStyle(ButtonStyle.Danger); // Red

  const row = new ActionRowBuilder().addComponents(applyButton, editButton);
  // Continue updating the same ephemeral message for subsequent steps
  await interaction.update({ content: summary, components: [row] });
}

client.login(process.env.BOT_TOKEN);
