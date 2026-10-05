// Chrome location: AIPI_CHROME_PATH, else the conventional install path for this OS.
const path = require('path');
module.exports = process.env.AIPI_CHROME_PATH || ({
  darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  win32: path.join(process.env['PROGRAMFILES'] || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe'),
  linux: '/usr/bin/google-chrome',
})[process.platform];
