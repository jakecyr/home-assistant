# Home Assistant

## Overview

This project is a TypeScript/Node.js voice assistant designed to run on a Raspberry Pi. It waits for the Porcupine wake word "Jarvis", streams microphone audio to AssemblyAI for transcription, and then lets an OpenAI model reason about the transcript and call local tools (for example, placeholder lighting controls in `src/tools`). When the model replies, the response is rendered to speech via OpenAI's TTS API and played through a locally available audio player. The default agent loop can call multiple tools per conversation turn and falls back to a direct response if no tools are needed.

### What the runtime does

- **Wake word detection:** `@picovoice/porcupine-node` listens for "Jarvis" while the assistant is idle.
- **Streaming speech-to-text:** `@picovoice/pvrecorder-node` captures PCM16 audio and ships 50 ms chunks to AssemblyAI's real-time streaming SDK, tuned to wait up to 10 s for speech with a 2 s end-of-turn silence window.
- **LLM reasoning and tool use:** The transcript is sent to OpenAI's Responses API (chat completions-compatible) where the model may call functions defined under `src/tools` before replying to the user.
- **Speech synthesis:** OpenAI's `gpt-4o-mini-tts` converts the model's final text into an in-memory WAV file which is played via `afplay`/`aplay`/`paplay`/`ffplay`/`play`, depending on the host platform.
- **Auditory cues:** Short earcons play when the assistant starts or stops listening so you always know when to speak.
- **Utterance handling:** If AssemblyAI returns an empty transcript the assistant apologises, keeps listening once more without the wake word, and only falls back to IDLE after a second miss. Background chatter is down-weighted via the system prompt so the agent stays quiet unless addressed.
- **Follow-up context:** After responding, the assistant immediately listens for a reply without requiring the wake word again, and it maintains a rolling history of recent exchanges (about six turns) so follow-up questions have context even after subsequent wake words.
- **Pluggable tools:** Tool metadata is converted to OpenAI function specs and executed inside `runAgentWithTools`, so you can expand the assistant by adding new files next to `lights.on.ts` and `lights.off.ts`.
- **Device & data integrations:** Built-in tools can toggle TP-Link Kasa plugs, Philips WiZ bulbs, fetch the weather, report the time/date, and run live web searches (via SerpAPI).

## Prerequisites

- **Node.js 20 LTS** (18+ should work, but 20 is recommended for better TLS/websocket defaults).
- **npm 9+** (ships with Node.js 20).
- **Microphone and speakers/headphones** connected to the machine running the assistant.
- **API keys** for Picovoice, AssemblyAI, and OpenAI (see [API keys](#api-keys)).

## Quick start

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy the sample environment file and fill in your secrets:
   ```bash
   cp env.example .env
   ```
3. Edit `.env` to set `PICOVOICE_ACCESS_KEY`, `ASSEMBLYAI_API_KEY`, `OPENAI_API_KEY`, and optionally tweak other variables (see below).
4. Compile the TypeScript sources (rerun after code changes):
   ```bash
   npm run build
   ```
5. Start the assistant:
   ```bash
   npm start
   ```
   The process prints `Jarvis on Pi starting…` and waits for you to say "Jarvis". Say the wake word and speak a request to exercise the end-to-end loop. If a supported command-line audio player is available, the reply is spoken aloud; otherwise you'll see a console warning reminding you to install one.
   - To keep the assistant running and restart on crashes, launch `scripts/run.sh` instead of `npm start`.

### Listing audio devices

After `npm install`, you can enumerate device labels that `PvRecorder` sees:

```bash
node -e "const { PvRecorder } = require('@picovoice/pvrecorder-node'); console.log(PvRecorder.getAvailableDevices().map((name, i) => `[${i}] ${name}`).join('\n'));"
```

Set `AUDIO_DEVICE` in `.env` to one of the printed indexes or to a substring of the desired label. Leave it as `default` to let PortAudio choose.

## Environment variables

All configuration lives in `.env` and is loaded via `dotenv` when the process starts.

| Variable               | Required | Description                                                                             | Default       |
| ---------------------- | -------- | --------------------------------------------------------------------------------------- | ------------- |
| `PICOVOICE_ACCESS_KEY` | ✅       | Porcupine access key used for offline wake-word detection.                              | –             |
| `ASSEMBLYAI_API_KEY`   | ✅       | API key for AssemblyAI's streaming transcription service.                               | –             |
| `OPENAI_API_KEY`       | ✅       | API key for the OpenAI Responses API.                                                   | –             |
| `AUDIO_DEVICE`         | ⬜️      | Microphone identifier (`default`, a numeric index, or a substring of the device label). | `default`     |
| `OPENAI_MODEL`         | ⬜️      | Chat/completions model ID to use for tool calls.                                        | `gpt-4o-mini` |
| `TTS_VOICE`            | ⬜️      | OpenAI voice name for synthesized responses (`alloy`, `ash`, `coral`, etc.).            | `onyx`        |
| `SERPAPI_KEY`          | ⬜️      | SerpAPI key to enable the `web_search` tool.                                            | –             |
| `ALLOW_SHELL`          | ⬜️      | Reserved for optional shell tooling—leave `false` unless you add such a tool yourself.  | `false`       |

### Optional config file

You can provide persistent device mappings and weather defaults via `config.json` (or `assistant.config.json`) in the project root. Point to another path with `npm start -- --config /path/to/config.json` or `scripts/run.sh -- --config /path/to/config.json`.

```json
{
  "tplink": {
    "devices": {
      "living_room_plug": "192.168.1.42",
      "desk_lamp": "192.168.1.43"
    }
  },
  "wiz": {
    "devices": {
      "sofa_light": "192.168.1.90"
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

Device tools accept either the friendly name or a raw IP address. Update the JSON whenever a bulb or plug changes networks.

#### Discovering devices automatically

Use the helper scripts to discover and optionally merge devices into your config file:

```bash
# Scan for TP-Link Kasa plugs and write them into config.json
node scripts/scan-tplink.js --write

# Scan for Philips WiZ bulbs and append them to config.json
node scripts/scan-wiz.js --write

# Specify a custom config path and overwrite existing entries if needed
node scripts/scan-tplink.js --config ./my-config.json --write --force

# Detect your approximate coordinates via IP and store them
node scripts/setup-weather.js --write
```

Each script prints the devices it finds (alias, IP, model) and, when `--write` is supplied, merges new entries into the `tplink.devices` or `wiz.devices` sections.

## API keys

- **Picovoice Porcupine:** Create a free Picovoice Console account and generate a new Porcupine AccessKey at <https://console.picovoice.ai/>. Paste the key into `PICOVOICE_ACCESS_KEY`.
- **AssemblyAI:** Sign in to the AssemblyAI dashboard at <https://www.assemblyai.com/dashboard>, create a project (if needed), and copy your real-time API token into `ASSEMBLYAI_API_KEY`.
- **OpenAI:** Visit <https://platform.openai.com/account/api-keys>, create a new secret key, and set `OPENAI_API_KEY`. Choose a model compatible with tool calling (for example, `gpt-4o-mini`) via `OPENAI_MODEL`.

## Development testing

### macOS

1. Install Node.js 20 (e.g., `brew install node@20`) and ensure your terminal app has microphone permission under **System Settings → Privacy & Security → Microphone**.
2. Follow the [quick start](#quick-start) steps to install packages, configure `.env`, and build the project.
3. Use the [device listing command](#listing-audio-devices) to find the built-in or USB microphone and set `AUDIO_DEVICE` if the default input is not correct.
4. Run `npm start` from the project root. The first launch will trigger a macOS permission prompt—accept it so the assistant can capture audio.
5. Say "Jarvis" and issue a test request (e.g., "turn on the living room lights"). Watch the console logs to confirm tool calls and responses.

### Windows 11 / 10

1. Install the latest Node.js 20 LTS build from <https://nodejs.org/> and restart PowerShell or Command Prompt so the `node` and `npm` commands are available.
2. Execute the [quick start](#quick-start) steps (PowerShell users can run `cp env.example .env` or `Copy-Item env.example .env`).
3. Run the [device listing command](#listing-audio-devices) in the same shell to find your USB microphone or headset name/index and set `AUDIO_DEVICE` in `.env` as needed.
4. Start the assistant with `npm start`. Windows will display a microphone access consent dialog the first time; click **Allow**.
5. Speak the wake word followed by a request. You should see `[tool]` logs when the assistant invokes `lights_on`/`lights_off` or any tools you add, and the spoken response should play through the detected audio device.

## Running on Raspberry Pi

The assistant is optimized for a Raspberry Pi 4/5 (64-bit Raspberry Pi OS) with a USB microphone.

1. **Prepare the OS and dependencies**
   ```bash
   sudo apt update
   sudo apt install -y git build-essential python3 make g++ alsa-utils
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs
   ```
2. **Clone and install**
   ```bash
   git clone <repository-url>
   cd assistant
   npm install
   cp env.example .env
   ```
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
- Review the built-in tools (`tplink_toggle`, `wiz_toggle`, `weather_current`, `time_now`, `web_search`) for examples of network calls, configuration access, and environment secrets.

## Troubleshooting tips

- **Wake word not triggering:** Double-check that the Porcupine access key is valid and that the microphone is routed to the selected device index.
- **No transcript:** Ensure the AssemblyAI key has real-time access and that outbound `wss://` traffic is allowed by your firewall.
- **Model refuses tool calls:** Confirm `OPENAI_MODEL` names a tool-capable model and that the tool schema matches the arguments you expect.
