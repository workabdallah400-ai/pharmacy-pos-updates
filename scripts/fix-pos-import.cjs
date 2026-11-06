const fs = require('fs');

let pos = fs.readFileSync('src/components/POSView.jsx', 'utf8');

if (!pos.includes("import { getUnitName } from '../utils/pharmacyUnits';")) {
  pos = "import { getUnitName } from '../utils/pharmacyUnits';\n" + pos;
  fs.writeFileSync('src/components/POSView.jsx', pos, 'utf8');
  console.log('Successfully injected getUnitName import into POSView.jsx!');
} else {
  console.log('Already has getUnitName import.');
}
