const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'output', 'runtime_state.json');
if (fs.existsSync(file)) fs.unlinkSync(file);
console.log('Live dashboard activity cleared. Original generated CSV/JSON datasets were not changed.');
