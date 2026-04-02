# Flow Mode

A Chrome extension to block distracting websites and set daily time limits to help you stay focused.

![Flow Mode Screenshot](https://img.shields.io/badge/Chrome-Extension-green?style=flat-square&logo=googlechrome)

## Features

- **Block distracting websites** - Add any domain to your block list
- **Daily time limits** - Set how many minutes per day you can spend on each site
- **Hard block mode** - Completely block a site with no bypass option
- **Soft block mode** - Get a warning but allow temporary bypass (5 minutes)
- **Time tracking** - See how much time you've spent on blocked sites today
- **Daily reset** - Time limits reset automatically at midnight

## Installation

### From Source (Developer Mode)

1. **Download the extension**
   - Click the green **Code** button above and select **Download ZIP**
   - Or clone the repository:
     ```bash
     git clone https://github.com/YOUR_USERNAME/flow-mode.git
     ```

2. **Extract the files** (if you downloaded the ZIP)
   - Unzip the downloaded file to a folder on your computer

3. **Open Chrome Extensions page**
   - Open Chrome and navigate to `chrome://extensions`
   - Or click the puzzle piece icon → **Manage Extensions**

4. **Enable Developer Mode**
   - Toggle the **Developer mode** switch in the top right corner

5. **Load the extension**
   - Click **Load unpacked**
   - Select the folder containing the extension files (the folder with `manifest.json`)

6. **Pin the extension** (optional)
   - Click the puzzle piece icon in Chrome's toolbar
   - Click the pin icon next to **Flow Mode**

## Usage

1. Click the Flow Mode icon in your Chrome toolbar
2. Enter a domain you want to block (e.g., `twitter.com`, `reddit.com`)
3. Click **Add**
4. Adjust the daily time limit using the slider (0 = completely blocked)
5. Toggle **Hard block** on to prevent any bypass

### Blocking Modes

| Mode | Daily Limit | Behavior |
|------|-------------|----------|
| **Time Limited** | 5-60 min | Site accessible until daily limit reached |
| **Soft Block** | 0 min | Shows warning, allows 5-min bypass |
| **Hard Block** | 0 min | Completely blocked, no bypass |

## Screenshots

The extension features a clean, modern interface:

- **List view** - Compact view of all blocked sites
- **Card view** - Expanded view with all controls visible
- **Block page** - Friendly reminder when you try to visit a blocked site

## Privacy

Flow Mode stores all data locally in your browser. No data is sent to any external servers.

## License

MIT License - feel free to use, modify, and distribute.

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.
