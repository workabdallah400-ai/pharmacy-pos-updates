const fs = require('fs');

// 1. Update ProductModal.jsx
let modal = fs.readFileSync('src/components/ProductModal.jsx', 'utf8');

// Replace handlePriceBoxChange
const oldPriceBoxChange = `  const handlePriceBoxChange = (val) => {
    const num = parseFloat(val);
    const strips = parseInt(formData.strips_per_box, 10) || 1;
    const units = parseInt(formData.units_per_strip, 10) || 1;
    const stripP = !isNaN(num) && strips > 0 ? (num / strips).toFixed(2) : formData.price_strip;
    const unitP = !isNaN(num) && strips > 0 && units > 0 ? (num / (strips * units)).toFixed(2) : formData.price_unit;
    setFormData((prev) => ({
      ...prev,
      price_box: val,
      price_strip: stripP,
      price_unit: unitP
    }));
  };`;

const newPriceBoxChange = `  const handlePriceBoxChange = (val) => {
    const num = parseFloat(val);
    const unitInfo = getUnitDisplayInfo(formData.unit_type);
    const strips = parseInt(formData.strips_per_box, 10) || 1;
    const units = parseInt(formData.units_per_strip, 10) || 1;

    let stripP = formData.price_strip;
    let unitP = formData.price_unit;

    if (!isNaN(num) && num > 0) {
      if (unitInfo.hasMidUnit) {
        // 3-tier: Box -> Strip -> Tablet
        stripP = strips > 0 ? (num / strips).toFixed(2) : '';
        unitP = (strips > 0 && units > 0) ? (num / (strips * units)).toFixed(2) : '';
      } else {
        // 2-tier: Box -> Single Unit (Ampoule / Sachet / Bottle / etc.)
        stripP = '';
        unitP = strips > 0 ? (num / strips).toFixed(2) : '';
      }
    }

    setFormData((prev) => ({
      ...prev,
      price_box: val,
      price_strip: stripP,
      price_unit: unitP
    }));
  };`;

if (modal.includes(oldPriceBoxChange)) {
  modal = modal.replace(oldPriceBoxChange, newPriceBoxChange);
}

fs.writeFileSync('src/components/ProductModal.jsx', modal, 'utf8');
console.log('ProductModal.jsx handlePriceBoxChange updated.');
