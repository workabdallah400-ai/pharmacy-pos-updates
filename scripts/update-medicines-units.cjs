const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

function classifyMedicine(tradeName, tradeNameAr) {
  const text = ((tradeName || '') + ' ' + (tradeNameAr || '')).toLowerCase();

  // 1. Drops (قطرات)
  if (
    text.includes('eye drop') || text.includes('ear drop') || text.includes('nasal drop') ||
    text.includes('oral drop') || text.includes('قطرة') || text.includes('قطارة') ||
    text.includes('نقط ') || text.includes('نقط للفم') || text.includes('drops')
  ) {
    return 'droppers';
  }

  // 2. Sprays / Inhalers (بخاخات)
  if (
    text.includes('spray') || text.includes('بخاخ') || text.includes('inhaler') || 
    text.includes('استنشاق') || text.includes('aerosol') || text.includes('بخاخة')
  ) {
    return 'sprays';
  }

  // 3. Sachets / Effervescent / Powder Packets (أكياس / فوار)
  if (
    text.includes('sachet') || text.includes('كيس') || text.includes('أكياس') || 
    text.includes('فوار') || text.includes('efferv') || text.includes('granule') ||
    text.includes('ساشيت') || text.includes('حبيبات فوارة')
  ) {
    return 'sachets';
  }

  // 4. Suppositories / Vaginal Ovules (لبوس / أقماع)
  if (
    text.includes('supp') || text.includes('لبوس') || text.includes('قمع') || 
    text.includes('أقماع') || text.includes('ovule') || text.includes('بويضة مهبلية')
  ) {
    return 'suppositories';
  }

  // 5. Ampoules & Injections (أمبولات / حقن كسر أو سائل)
  if (
    text.includes('amp') || text.includes('أمبول') || text.includes('امبول') || 
    text.includes('vial') || text.includes('فيال') || text.includes('حقن') || 
    text.includes('سيرينج') || text.includes('syringe') || text.includes('cartridge') ||
    text.includes('خرطوشة') || text.includes('inj') || text.includes('infusion') ||
    text.includes('محلول وريدي') || text.includes('حقنة')
  ) {
    if (text.includes('vial') || text.includes('فيال')) return 'vials';
    return 'ampoules';
  }

  // 6. Capsules / Softgel (كبسولات - شريط كبسولات)
  if (
    (text.includes('cap') && !text.includes('caplet')) || 
    text.includes('كبسول') || 
    text.includes('softgel') || 
    text.includes('soft gel')
  ) {
    return 'capsules';
  }

  // 7. Creams / Ointments / Gels (كريمات / مراهم / جل - أنبوبة)
  if (
    text.includes('cream') || text.includes('كريم') || text.includes('ointment') ||
    text.includes('مرهم') || text.includes(' gel') || text.includes('جل ') ||
    text.includes('tube') || text.includes('أنبوبة') || text.includes('انبوبة') ||
    text.includes('دهان') || text.includes('paste') || text.includes('معجون')
  ) {
    return 'tubes';
  }

  // 8. Bottles / Syrups / Liquids / Suspensions (شرب / معلق / زجاجات)
  if (
    text.includes('syrup') || text.includes('شراب') || text.includes('susp') || 
    text.includes('معلق') || text.includes('bottle') || text.includes('زجاجة') || 
    text.includes('liquid') || text.includes('سائل') || text.includes('solution') || 
    text.includes('محلول') || text.includes('mouthwash') || text.includes('غسول') || 
    text.includes('lotion') || text.includes('لوشن') || text.includes('elixir') ||
    text.includes('شامبو') || text.includes('shampoo') || text.includes('emulsion')
  ) {
    return 'bottles';
  }

  // 9. Tablets / Pills / Caplets (أقراص / حبوب - العلبة فيها شرائط والشريط فيه أقراص)
  return 'tablets';
}

function extractPackCounts(tradeName, tradeNameAr, unitType) {
  const str = ((tradeName || '') + ' ' + (tradeNameAr || '')).toLowerCase();
  
  if (unitType === 'bottles' || unitType === 'tubes' || unitType === 'droppers' || unitType === 'sprays') {
    return { strips_per_box: 1, units_per_strip: 1 };
  }

  const countMatch = str.match(/(\d+)\s*(sachet|كيس|أكياس|amp|أمبول|امبول|supp|لبوس|vial|فيال|tab|قرص|cap|كبسول)/i);
  const totalItems = countMatch ? parseInt(countMatch[1], 10) : null;

  if (unitType === 'ampoules' || unitType === 'vials') {
    return { strips_per_box: 1, units_per_strip: totalItems || 3 };
  }

  if (unitType === 'sachets') {
    return { strips_per_box: 1, units_per_strip: totalItems || 10 };
  }

  if (unitType === 'tablets' || unitType === 'capsules') {
    let strips = 2;
    let units = 10;
    if (totalItems) {
      if (totalItems >= 30) {
        strips = 3;
        units = Math.round(totalItems / 3);
      } else if (totalItems >= 20) {
        strips = 2;
        units = Math.round(totalItems / 2);
      } else if (totalItems >= 10) {
        strips = totalItems <= 10 ? 1 : 2;
        units = totalItems <= 10 ? totalItems : Math.round(totalItems / 2);
      } else {
        strips = 1;
        units = totalItems;
      }
    }
    return { strips_per_box: strips, units_per_strip: units };
  }

  return { strips_per_box: 1, units_per_strip: totalItems || 1 };
}

async function run() {
  const SQL = await initSqlJs();
  const dbPath = path.resolve('public/pharmacy_pos.db');
  const filebuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(filebuffer);

  // 1. Ensure columns
  try { db.run("ALTER TABLE medicines ADD COLUMN unit_type TEXT DEFAULT 'tablets';"); } catch(e){}
  try { db.run("ALTER TABLE medicines ADD COLUMN units_per_strip INTEGER DEFAULT 10;"); } catch(e){}
  try { db.run("ALTER TABLE medicines ADD COLUMN price_unit REAL DEFAULT 0;"); } catch(e){}
  try { db.run("ALTER TABLE medicines ADD COLUMN stock_units INTEGER DEFAULT 0;"); } catch(e){}
  try { db.run("ALTER TABLE medicines ADD COLUMN expiry TEXT;"); } catch(e){}

  const rows = db.exec('SELECT id, trade_name, trade_name_ar, price_box, price_strip, strips_per_box FROM medicines')[0].values;
  console.log(`Processing ${rows.length} medicines into ${dbPath}...`);

  db.run('BEGIN TRANSACTION;');
  const stmt = db.prepare('UPDATE medicines SET unit_type = ?, strips_per_box = ?, units_per_strip = ?, price_strip = ?, price_unit = ? WHERE id = ?');

  const stats = {};
  for (const [id, tn, tnar, priceBox, curPriceStrip, curStrips] of rows) {
    const unitType = classifyMedicine(tn, tnar);
    stats[unitType] = (stats[unitType] || 0) + 1;
    const counts = extractPackCounts(tn, tnar, unitType);
    
    const pBox = Number(priceBox) || 0;
    const strips = counts.strips_per_box;
    const units = counts.units_per_strip;

    let pStrip = pBox;
    let pUnit = pBox;

    if (unitType === 'tablets' || unitType === 'capsules' || unitType === 'suppositories') {
      pStrip = strips > 0 ? parseFloat((pBox / strips).toFixed(2)) : pBox;
      pUnit = (strips * units) > 0 ? parseFloat((pBox / (strips * units)).toFixed(2)) : pStrip;
    } else if (unitType === 'ampoules' || unitType === 'vials' || unitType === 'sachets') {
      // Box -> ampoules / sachets (no strip level, direct unit)
      pStrip = pBox;
      pUnit = units > 0 ? parseFloat((pBox / units).toFixed(2)) : pBox;
    } else {
      // bottles, tubes, droppers, sprays
      pStrip = pBox;
      pUnit = pBox;
    }

    stmt.run([unitType, strips, units, pStrip, pUnit, id]);
  }
  stmt.free();
  db.run('COMMIT;');

  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
  console.log('✅ Successfully updated public/pharmacy_pos.db with full dosage unit classification:');
  console.log(JSON.stringify(stats, null, 2));
}

run().catch(console.error);
