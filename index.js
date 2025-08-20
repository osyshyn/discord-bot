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
} = require("discord.js");

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
      const additionalPrompt = interaction.fields.getTextInputValue("additionalPromptInput");
      userSurveyData.get(interaction.user.id).bookTitle = bookTitle;
      userSurveyData.get(interaction.user.id).bookLength = bookLength;
      userSurveyData.get(interaction.user.id).additionalPrompt = additionalPrompt;
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
      await sendCitationFormatSelect(interaction);
    } else if (interaction.customId === "citationFormatSelect") {
      const citationFormat = interaction.values[0];
      userSurveyData.get(interaction.user.id).citationFormat = citationFormat;
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
        
        console.log('User data retrieved:', userData);
        console.log('User ID:', interaction.user.id);
        
        // Update the message to show processing
        await interaction.update({ content: "🔄 Processing your request...\n\nGenerating your book...", components: [] }); 
        
        try {
        const webhookUrl = process.env.WEBHOOK_URL;
        if (!webhookUrl) {
          console.error("WEBHOOK_URL is not set in .env file!");
          await interaction.followUp({ content: "Error: WEBHOOK_URL is not set. Cannot send data.", flags: 64 });
          return;
        }

        // Build the JSON payload as specified
        const sessionId = interaction.channelId;
        const payload = {
          bookTitle: userData.bookTitle,
          bookLength: userData.bookLength,
          additionalPrompt: userData.additionalPrompt || "",
          writingStyle: userData.writingStyle,
          discordBotMode: userData.discordBotMode,
          userEngagementLevel: userData.userEngagementLevel,
          bookFormat: userData.bookFormat,
          citationFormat: userData.citationFormat,
          sessionId
        };

        console.log('Sending payload to n8n:', payload);

        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(`n8n request failed: ${response.status} ${response.statusText}`);
        }

        const responseData = await response.json();
        
        // Handle both array and direct object responses
        const data = Array.isArray(responseData) ? responseData[0] : responseData;
        
        if (!data.ok || !data.bookText) {
          throw new Error('n8n returned invalid response or no book text');
        }

        const bookText = data.bookText;
        const bookFormat = userData.bookFormat;
        const bookTitle = userData.bookTitle;

        // Generate file based on requested format
        let fileBuffer;
        const sanitizedTitle = bookTitle.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
        const fileName = `${sanitizedTitle}.${bookFormat}`;

        switch (bookFormat) {
          case "epub":
            fileBuffer = await makeEpubBuffer({ title: bookTitle, author: "Writing Assistant", text: bookText });
            break;
          case "docx":
            fileBuffer = await makeDocxBuffer({ title: bookTitle, text: bookText });
            break;
          case "pdf":
            fileBuffer = await makePdfBuffer({ title: bookTitle, text: bookText });
            break;
          case "mobi":
            const epubBuf = await makeEpubBuffer({ title: bookTitle, text: bookText });
            fileBuffer = await epubToMobiBuffer(epubBuf);
            break;
          default:
            fileBuffer = await makeEpubBuffer({ title: bookTitle, text: bookText });
        }

        const attachment = new AttachmentBuilder(fileBuffer, {
          name: fileName,
        });

        await interaction.followUp({
          content: "✅ Here is your book",
          files: [{ attachment: fileBuffer, name: fileName }],
          flags: 64,
        });
        
        userSurveyData.delete(interaction.user.id); // Clear data after sending

      } catch (error) {
        console.error("Error processing book generation:", error);
        
        let errorMessage = "❌ An error occurred while generating your book.\n\n";
        
        if (error.message.includes('n8n request failed')) {
          errorMessage += "**n8n Workflow Error:** The n8n workflow failed to process your request. Please try again later.";
        } else if (error.message.includes('n8n returned invalid response')) {
          errorMessage += "**n8n Response Error:** The n8n workflow returned an invalid response. Please try again.";
        } else if (error.message.includes('WEBHOOK_URL')) {
          errorMessage += "**Configuration Error:** Webhook URL not configured. Please contact support.";
        } else {
          errorMessage += "**Unknown Error:** Please try again or contact support if the issue persists.";
        }

        await interaction.followUp({ 
          content: errorMessage, 
          flags: 64
        });
      }
    } else if (interaction.customId === "editButton") {
      // Restart the survey - clear existing data and initialize fresh
      userSurveyData.delete(interaction.user.id);
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

  const additionalPromptInput = new TextInputBuilder()
    .setCustomId("additionalPromptInput")
    .setLabel("Additional Prompt (Optional)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setPlaceholder("Add any specific details, themes, or instructions for your book...");

  const firstActionRow = new ActionRowBuilder().addComponents(bookTitleInput);
  const secondActionRow = new ActionRowBuilder().addComponents(bookLengthInput);
  const thirdActionRow = new ActionRowBuilder().addComponents(additionalPromptInput);

  modal.addComponents(firstActionRow, secondActionRow, thirdActionRow);

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
  await interaction.reply({ content: "Select a writing style:", components: [row], flags: 64 });
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
  await interaction.update({ content: "📁 **Step 5:** Select book format:", components: [row] });
}

async function sendCitationFormatSelect(interaction) {
  const select = new StringSelectMenuBuilder()
    .setCustomId("citationFormatSelect")
    .setPlaceholder("Select citation format")
    .addOptions([
      {
        label: "APA",
        description: "American Psychological Association style",
        value: "apa",
      },
      {
        label: "MLA",
        description: "Modern Language Association style",
        value: "mla",
      },
      {
        label: "Chicago",
        description: "Chicago Manual of Style",
        value: "chicago",
      },
    ]);

  const row = new ActionRowBuilder().addComponents(select);
  // Continue updating the same ephemeral message for subsequent steps
  await interaction.update({ content: "📚 **Step 6:** Select citation format:", components: [row] });
}

async function sendSummaryAndOptions(interaction) {
  const userData = userSurveyData.get(interaction.user.id);
  let summary = "📋 **Book Generation Summary:**\n\n";
  summary += `📖 **Book Title:** ${userData.bookTitle}\n`;
  summary += `📏 **Book Length:** ${userData.bookLength} words\n`;
  if (userData.additionalPrompt && userData.additionalPrompt.trim()) {
    summary += `💡 **Additional Prompt:** ${userData.additionalPrompt}\n`;
  }
  summary += `🎨 **Writing Style:** ${userData.writingStyle}\n`;
  summary += `🤖 **Bot Mode:** ${userData.discordBotMode}\n`;
  summary += `👥 **Engagement Level:** ${userData.userEngagementLevel}\n`;
  summary += `📁 **Book Format:** ${userData.bookFormat}\n`;
  summary += `📚 **Citation Format:** ${userData.citationFormat}\n\n`;
  summary += "Ready to generate your book? Click **Apply** to proceed!";

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

// File generation functions
async function makeEpubBuffer({ title, author, text }) {
  try {
    const epubContent = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${title}</dc:title>
    <dc:creator>${author}</dc:creator>
    <dc:language>en</dc:language>
    <dc:identifier id="uid">${Date.now()}</dc:identifier>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="nav"/>
    <itemref idref="chapter1"/>
  </spine>
</package>`;

    const chapterContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${title}</title>
</head>
<body>
  <h1>${title}</h1>
  <div>${text.replace(/\n/g, '<br/>')}</div>
</body>
</html>`;

    const navContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>Navigation</title>
</head>
<body>
  <nav epub:type="toc">
    <h1>Table of Contents</h1>
    <ol>
      <li><a href="chapter1.xhtml">${title}</a></li>
    </ol>
  </nav>
</body>
</html>`;

    const JSZip = require('jszip');
    const zipFile = new JSZip();
    
    zipFile.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);
    
    zipFile.file('content.opf', epubContent);
    zipFile.file('chapter1.xhtml', chapterContent);
    zipFile.file('nav.xhtml', navContent);
    
    return await zipFile.generateAsync({ type: 'nodebuffer' });
  } catch (error) {
    console.error('Error generating EPUB:', error);
    throw new Error('Failed to generate EPUB');
  }
}

async function makeDocxBuffer({ title, text }) {
  try {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');
    
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            text: title,
            heading: HeadingLevel.HEADING_1,
            alignment: 'center'
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: text,
                size: 24
              })
            ]
          })
        ]
      }]
    });

    return await Packer.toBuffer(doc);
  } catch (error) {
    console.error('Error generating DOCX:', error);
    throw new Error('Failed to generate DOCX');
  }
}

async function makePdfBuffer({ title, text }) {
  try {
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument();
    
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    
    doc.fontSize(24).text(title, { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(text);
    doc.end();
    
    // Wait for the PDF to finish generating
    return new Promise((resolve, reject) => {
      doc.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      doc.on('error', reject);
    });
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error('Failed to generate PDF');
  }
}

async function epubToMobiBuffer(epubBuffer) {
  try {
    const fs = require('fs');
    const path = require('path');
    const { exec } = require('child_process');
    const { promisify } = require('util');
    
    const execAsync = promisify(exec);
    
    // Create temporary directory
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }
    
    const epubPath = path.join(tempDir, `${Date.now()}_book.epub`);
    const mobiPath = epubPath.replace('.epub', '.mobi');
    
    // Write EPUB buffer to file
    fs.writeFileSync(epubPath, epubBuffer);
    
    // Convert to MOBI
    await execAsync(`ebook-convert "${epubPath}" "${mobiPath}"`);
    
    // Read MOBI file
    const mobiBuffer = fs.readFileSync(mobiPath);
    
    // Clean up temporary files
    fs.unlinkSync(epubPath);
    fs.unlinkSync(mobiPath);
    
    return mobiBuffer;
  } catch (error) {
    console.error('Error converting EPUB to MOBI:', error);
    throw new Error('Failed to convert EPUB to MOBI. Make sure Calibre CLI is installed.');
  }
}

client.login(process.env.BOT_TOKEN);