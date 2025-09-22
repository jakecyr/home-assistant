# Home Assistant

A voice-controlled assistant that responds to the wake word "Jarvis" and can control smart home devices, answer questions, and more.

## Key Features

- 🎤 Wake word detection with Porcupine
- 🗣️ Speech-to-text using AssemblyAI
- 🧠 Powered by OpenAI's language models
- 🎵 Text-to-speech response
- 🔌 Control smart home devices (TP-Link Kasa)
- ⏰ Check time and weather
- 🌐 Web search capabilities
- 🔄 Follow-up conversation support

## 🚀 Quick Start

### Prerequisites
- Node.js 20 LTS or later
- Microphone and speakers/headphones
- API keys for [Picovoice](https://console.picovoice.ai/), [AssemblyAI](https://www.assemblyai.com/), and [OpenAI](https://platform.openai.com/)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd assistant

# Install dependencies
npm install

# Set up environment
cp env.example .env
# Edit .env with your API keys

# Build the project
npm run build

# Start the assistant
npm start
```

### Running the Assistant

1. The assistant will start and wait for the wake word "Jarvis"
2. Speak your command after hearing the activation sound
3. The assistant will process your request and respond

#### Useful Commands
- `npm start` - Start the assistant
- `npm test` - Run tests
- `npm run build` - Rebuild after making changes
- `./scripts/run.sh` - Run with auto-restart on crashes

#### Configuration
Customize the assistant by creating a `config.json` file. See the example below for available options.

## 🎙️ Audio Setup

To list available audio devices:
```bash
node scripts/list-audio-devices.js
```

Set `AUDIO_DEVICE` in `.env` to the desired device index or name.

## ⚙️ Configuration

### Environment Variables

| Variable               | Required | Description                         | Default       |
|------------------------|----------|-------------------------------------|---------------|
| `PICOVOICE_ACCESS_KEY` | ✅       | For wake-word detection             | –             |
| `ASSEMBLYAI_API_KEY`   | ✅       | For speech-to-text                  | –             |
| `OPENAI_API_KEY`       | ✅       | For language model and text-to-speech | –             |
| `AUDIO_DEVICE`         | ⬜️      | Microphone device identifier        | `default`     |
| `OPENAI_MODEL`         | ⬜️      | OpenAI model to use                 | `gpt-4o-mini` |
| `SERPAPI_KEY`          | ⬜️      | Required for web search             | –             |

### Config File

Create a `config.json` file to customize device mappings and enable features:

```json
{
  "tools": ["tplink_toggle", "time_now", "weather_current", "web_search"],
  "tplink": {
    "devices": {
      "living_room_plug": {
        "ip": "192.168.1.42",
        "room": "living room",
        "aliases": ["couch plug"]
      }
    }
  },
  "weather": {
    "latitude": 47.6062,
    "longitude": -122.3321,
    "units": "imperial",
    "timezone": "America/Los_Angeles"
  }
}
```

#### Auto-Discovery

Discover TP-Link devices automatically:
```bash
node scripts/scan-tplink.js --write
node scripts/setup-weather.js --write
```


2. **AssemblyAI**
   - Get a key from [AssemblyAI](https://www.assemblyai.com/)
   - Set as `ASSEMBLYAI_API_KEY`

3. **OpenAI**
   - Get a key from [OpenAI](https://platform.openai.com/account/api-keys)
   - Set as `OPENAI_API_KEY`

## 🖥️ Platform Setup

### Raspberry Pi (Recommended)

```bash
# Install dependencies
sudo apt update
sudo apt install -y git build-essential python3 make g++ alsa-utils
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Follow the Quick Start instructions above
```

### macOS
1. Install Node.js 20: `brew install node@20`
2. Grant microphone access in System Settings → Privacy & Security → Microphone
3. Follow the Quick Start instructions

### Windows
1. Install Node.js 20 from [nodejs.org](https://nodejs.org/)
2. Run PowerShell as Administrator and execute the Quick Start steps
3. Allow microphone access when prompted
3. **Configure audio**
   - Run `arecord -l` to verify the microphone shows up. Note the card/device numbers.
   - Use the [device listing command](#listing-audio-devices) or set `AUDIO_DEVICE` to the matching index/label in `.env` (leave as `default` if ALSA default is correct).
4. **Provide secrets**
   - Add your Picovoice, AssemblyAI, and OpenAI keys to `.env`.
5. **Build and run**
   ```bash
   npm run build
   npm start
   ```
   Keep the terminal open; the assistant logs status transitions (IDLE → LISTENING → THINKING) as audio flows. Replies are spoken out loud when a supported player (`aplay`, `paplay`, `ffplay`, or `play`) is installed.
6. **(Optional) Keep it running**
   - Use `tmux`, `screen`, or a process manager like `pm2` to keep the assistant alive after logout.
   - Configure your Pi's audio output (e.g., `raspi-config` → System Options → Audio) if you want spoken responses through speakers.

## Extending the assistant

- Add new tool files to `src/tools` that implement the `Tool` interface and export `name`, `description`, `parameters`, and `execute`.
- Re-run `npm run build` after adding or editing TypeScript files.
- Update downstream hardware integrations (e.g., replace the placeholder lighting code with real GPIO or smart-home API calls).
- Provide config-driven lookups via `loadConfig` (see `src/config.ts`) if your tools need user-defined settings.
- Review the built-in tools (`tplink_toggle`, `weather_current`, `time_now`, `web_search`) for examples of network calls, configuration access, and environment secrets.

## Troubleshooting tips

- **Wake word not triggering:** Double-check that the Porcupine access key is valid and that the microphone is routed to the selected device index.
- **No transcript:** Ensure the AssemblyAI key has real-time access and that outbound `wss://` traffic is allowed by your firewall.
- **Model refuses tool calls:** Confirm `OPENAI_MODEL` names a tool-capable model and that the tool schema matches the arguments you expect.
- **Volume too low on Raspberry PI:** The volume can be increased by running the command `amixer sset Master 90%` with the desired volume percentage.
