# Discord Bot with Book Generation

A Discord bot that generates books in various formats (EPUB, MOBI, PDF) based on user input through an interactive survey.

## Features

- Interactive Discord slash command interface
- Book generation with customizable parameters:
  - Book title and length
  - Writing style selection
  - Discord bot mode (Brainstorm/Writer)
  - User engagement level
  - Output format (EPUB, MOBI, PDF)
- Integration with n8n webhook for AI-powered content generation
- File generation in multiple formats
- Automatic cleanup of temporary files

## Prerequisites

### Required Software
- **Node.js** (v16 or higher)
- **Calibre CLI** (for MOBI format conversion)
  - Download from: https://calibre-ebook.com/download
  - Ensure `ebook-convert` command is available in your system PATH

### Environment Variables
Create a `.env` file in the project root with:
```
BOT_TOKEN=your_discord_bot_token
WEBHOOK_URL=your_n8n_webhook_url
```

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up your environment variables
4. Install Calibre CLI (for MOBI support)
5. Run the bot:
   ```bash
   node index.js
   ```

## Usage

1. Use the `/begin` slash command in Discord
2. Follow the interactive survey to set book parameters
3. The bot will send your request to n8n
4. Once processed, you'll receive the generated book file

## Supported Formats

- **EPUB**: Standard ebook format, generated natively
- **MOBI**: Kindle-compatible format (requires Calibre CLI)
- **PDF**: Portable Document Format
- **DOCX**: Microsoft Word format (fallback to EPUB)

## Error Handling

The bot includes comprehensive error handling for:
- Failed n8n webhook requests
- File generation errors
- MOBI conversion failures
- Network timeouts
- Empty responses

## File Management

- Temporary files are automatically created in a `temp/` directory
- Files are automatically cleaned up after sending to users
- Each file gets a unique timestamp-based filename

## Dependencies

- `discord.js`: Discord bot framework
- `jszip`: EPUB file generation
- `pdfkit`: PDF file generation
- `dotenv`: Environment variable management

## Troubleshooting

### MOBI Conversion Issues
- Ensure Calibre CLI is installed and `ebook-convert` is in your PATH
- Check that the command works in your terminal: `ebook-convert --help`

### File Generation Errors
- Verify you have write permissions in the project directory
- Check that all dependencies are properly installed
- Review console logs for detailed error messages

### n8n Integration
- Verify your webhook URL is correct and accessible
- Ensure the n8n workflow returns the generated text in the response body
- Check that the webhook doesn't have authentication issues
