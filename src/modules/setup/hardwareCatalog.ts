import { HardwareGadget, WorkstationProfile } from './hardware.types.ts';

export const DEFAULT_HARDWARE_GADGETS: HardwareGadget[] = [
  // 1. INWARD OCEAN FREIGHT & BALE RECEIVING
  {
    id: 'gadget-crane-scale',
    module: 'purchase',
    category: 'scale',
    name: 'Industrial Crane / Bale Hanging Scale',
    recommendedModel: 'CAS Caston-III (300kg) / OCS Heavy Digital Crane Scale',
    brand: 'CAS Corp / OCS',
    connectivity: 'BLUETOOTH',
    status: 'CONNECTED',
    purpose: 'Gross weight verification of entire compressed bales upon container unloading from Jebel Ali Port.',
    specifications: [
      'Capacity: 500 kg (resolution: 0.1 kg / 100g)',
      'Wireless handheld remote tare & gross toggle (up to 30m range)',
      'Rechargeable 6V battery (80+ hours continuous dock operation)',
      'Rotatable swivel cast-iron shackle & hook'
    ],
    operationalRole: 'Verifies actual unloaded bale weight against the Bill of Lading (B/L) packing list before accepting Inward Gate Pass (IGP).',
    maintenanceTip: 'Perform weekly zero calibration with a 20kg certified test weight.',
    isDefault: true
  },
  {
    id: 'gadget-dock-tablet',
    module: 'purchase',
    category: 'tablet_pda',
    name: 'Ruggedized Android Dock Floor Tablet',
    recommendedModel: 'Samsung Galaxy Tab Active4 Pro (IP68) / Zebra ET40',
    brand: 'Samsung / Zebra',
    connectivity: 'ETHERNET_WIFI',
    status: 'CONNECTED',
    purpose: 'On-the-dock container seal inspection, photo damage recording, and digital Inward Gate Pass sign-off.',
    specifications: [
      'MIL-STD-810H military drop resistance + IP68 dust/waterproofing',
      'Anti-shock protective casing + glove-touch capable screen',
      'High-res camera for seal number & container customs stamp OCR',
      'Wi-Fi 6 & 5G dual-SIM failover for outdoor container yards'
    ],
    operationalRole: 'Used by the dock supervisor to inspect bales, log moisture levels, and approve IGP documents in real-time.',
    maintenanceTip: 'Ensure S-Pen tether is securely locked to prevent dropping into open container crevices.',
    isDefault: true
  },
  {
    id: 'gadget-textile-moisture',
    module: 'purchase',
    category: 'tool',
    name: 'Textile Digital Needle Moisture Meter',
    recommendedModel: 'Delmhorst J-2000 / Protimeter Balemaster',
    brand: 'Delmhorst Instruments',
    connectivity: 'MANUAL_PHYSICAL',
    status: 'STANDBY',
    purpose: 'Penetrates bale interiors to detect ocean dampness, mildew risks, or seawater ingress during oceanic transit.',
    specifications: [
      'Dual 150mm insulated contact pins for deep bale penetration',
      'Moisture reading range: 6% – 30% for natural cotton & wool fibers',
      'Audible threshold alarm for moisture exceeding 12% relative threshold'
    ],
    operationalRole: 'Protects the business against purchasing waterlogged bales that degrade vintage fabric integrity.',
    maintenanceTip: 'Wipe pins with dry microfiber after testing damp bales to prevent contact oxidation.'
  },
  {
    id: 'gadget-bale-cutters',
    module: 'purchase',
    category: 'tool',
    name: 'Industrial High-Tensile Bale Wire Cutters & Dock Hooks',
    recommendedModel: 'Knipex 95 62 190 Wire Rope Shears & Forged Dock Bale Hooks',
    brand: 'Knipex / Vaughan',
    connectivity: 'MANUAL_PHYSICAL',
    status: 'CONNECTED',
    purpose: 'Safely snip reinforced steel bale straps and roll heavy 100kg bales without tearing fabric.',
    specifications: [
      'Heavy-duty hardened cutting edges (up to 64 HRC)',
      'Non-slip ergonomic grips with safety rebound restraint',
      'Forged steel bale hook with hardwood handle for manual maneuvering'
    ],
    operationalRole: 'Essential PPE & tools for warehouse receiving crew during bale break-up.',
    maintenanceTip: 'Oil pivot joints monthly with industrial lubricating grease.'
  },

  // 2. BALE SORTING & PIECE CATALOGING TERMINAL
  {
    id: 'gadget-bench-scale',
    module: 'sorting',
    category: 'scale',
    name: 'Precision Sorting Bench Scale (Continuous HID/RS232)',
    recommendedModel: 'OHAUS Defender 3000 / Mettler Toledo BBA231 (15kg x 0.5g)',
    brand: 'OHAUS / Mettler Toledo',
    connectivity: 'USB_HID',
    status: 'CONNECTED',
    purpose: 'Continuous streaming gram weight measurement for individual vintage garments (T-shirts, denim, fleeces).',
    specifications: [
      'Capacity: 15 kg (dual precision resolution: 0.5g / 0.001 lb)',
      'Continuous RS-232 / USB HID data streaming directly to web terminal',
      'Stainless steel 304 sanitary weighing pan (305 x 355 mm)',
      'Sub-second weight stabilization LED trigger'
    ],
    operationalRole: 'Feeds live gram weight into the Bale Sorting Terminal to calculate exact Cost-Per-Gram allocation.',
    baudRate: 9600,
    maintenanceTip: 'Ensure level bubble is centered using adjustable rubber feet before daily sorting shifts.',
    isDefault: true
  },
  {
    id: 'gadget-label-printer',
    module: 'sorting',
    category: 'printer',
    name: 'Direct Thermal Garment Tag Printer (2" x 1")',
    recommendedModel: 'Zebra ZD421d (Direct Thermal, 203 DPI) / TSC TE200',
    brand: 'Zebra Technologies',
    connectivity: 'USB_HID',
    status: 'CONNECTED',
    purpose: 'Instant printing of Code-128 / QR barcode price tags and grade labels upon each piece extraction.',
    specifications: [
      'Print width: 2 inch (50mm x 25mm label media roll)',
      'Print speed: Up to 6 inches per second (152 mm/sec)',
      'Direct thermal technology (no costly ink ribbons or toners needed)',
      'ZPL II & EPL emulation for instantaneous browser thermal printing'
    ],
    operationalRole: 'Prints garment price sticker immediately when the sorter confirms a piece in the terminal.',
    paperSize: '50x25mm_TAG',
    maintenanceTip: 'Clean thermal printhead with 99% isopropyl alcohol pen every 3 rolls of labels.',
    isDefault: true
  },
  {
    id: 'gadget-ring-scanner',
    module: 'sorting',
    category: 'scanner',
    name: 'Bluetooth Hands-Free Wearable Ring Scanner',
    recommendedModel: 'Zebra RS5100 Wearable Bluetooth 1D/2D Ring Scanner',
    brand: 'Zebra Technologies',
    connectivity: 'BLUETOOTH',
    status: 'CONNECTED',
    purpose: 'Allows sorters to keep both hands free to handle garments, inspect vintage tags, and weigh without pausing.',
    specifications: [
      'Ultra-lightweight (70 grams) ergonomic two-finger ambidextrous ring',
      'SE4770 laser scan engine reads worn, crinkled, or low-contrast tags',
      'Class 1 Bluetooth 5.0 with up to 100 meters pairing radius',
      'Haptic vibration + audible double-beep on successful scan'
    ],
    operationalRole: 'Dramatically speeds up bale breakdown throughput from 45 pieces/hr to 120+ pieces/hr.',
    maintenanceTip: 'Swap to backup battery module at lunchtime for continuous 12-hour terminal operation.',
    isDefault: true
  },
  {
    id: 'gadget-tagging-gun',
    module: 'sorting',
    category: 'tool',
    name: 'Fine Fabric Pistol Tag Attacher & Kimble Fasteners',
    recommendedModel: 'Avery Dennison Mark III Fine Fabric (08944) + 15mm Polypropylene Fasteners',
    brand: 'Avery Dennison',
    connectivity: 'MANUAL_PHYSICAL',
    status: 'CONNECTED',
    purpose: 'Fastens printed thermal card tags onto vintage garment care labels or seams without fabric puncturing.',
    specifications: [
      'Fine-gauge stainless needle (1.3mm diameter) prevents fabric hole damage',
      'Smooth gear-driven trigger mechanism with anti-jam needle feed',
      'Compatible with 15mm, 25mm, and 35mm micro-fastener combs'
    ],
    operationalRole: 'Secures barcode tags to shirts and jackets without damaging vintage single-stitch collector pieces.',
    maintenanceTip: 'Replace needle immediately if tip develops a burr to avoid snagging delicate silks or rayons.'
  },

  // 3. LIVE COMMERCE STUDIO (TIKTOK, INSTAGRAM, WHATNOT)
  {
    id: 'gadget-live-scanner',
    module: 'live',
    category: 'scanner',
    name: 'Wireless 2D Live Drop Presentation Barcode Scanner',
    recommendedModel: 'Inateck BCST-70 Bluetooth 2D / Zebra DS2278 Wireless',
    brand: 'Inateck / Zebra',
    connectivity: 'BLUETOOTH',
    status: 'CONNECTED',
    purpose: 'Host or studio assistant scans item barcodes live on camera as viewers claim drops to lock carts instantly.',
    specifications: [
      'Instant trigger response (<50ms barcode decode rate)',
      'Decodes high-density 2D QR codes and damaged thermal barcodes',
      'Wireless 2.4GHz USB dongle + Bluetooth 5.2 dual mode',
      'Soft rubber shock bumper with withstands accidental studio drops'
    ],
    operationalRole: 'Adds claimed vintage pieces into the live customer cart and triggers the 15-minute hold timer.',
    maintenanceTip: 'Keep charging cradle plugged into studio master power bar.',
    isDefault: true
  },
  {
    id: 'gadget-studio-display',
    module: 'live',
    category: 'tablet_pda',
    name: 'Host Studio Display & Articulated Mount',
    recommendedModel: 'Apple iPad Pro 12.9" / 15.6" Portable USB-C Touch on Elgato Master Mount',
    brand: 'Apple / Elgato',
    connectivity: 'ETHERNET_WIFI',
    status: 'CONNECTED',
    purpose: 'Shows the Live Selling Terminal countdown timer, basket total, and stream chat in the host field of view.',
    specifications: [
      '12.9-inch Liquid Retina XDR screen with 1000 nits peak brightness',
      'Heavy-duty desk clamp with 3-section articulated steel boom arm',
      'Dedicated landscape mounting bracket next to streaming phone camera'
    ],
    operationalRole: 'Keeps host aware of active cart reservations, claims, and session revenue without looking away.',
    isDefault: true
  },
  {
    id: 'gadget-studio-lights',
    module: 'live',
    category: 'audio_video',
    name: 'Color-Accurate Studio Softbox Lighting (CRI 97+)',
    recommendedModel: 'Godox SL60W LED Video Light / Neewer Bi-Color 660 LED Panels',
    brand: 'Godox / Neewer',
    connectivity: 'MANUAL_PHYSICAL',
    status: 'CONNECTED',
    purpose: 'Renders true vintage wash, fading, distress, and stitch colors on camera to minimize buyer return claims.',
    specifications: [
      'Color Rendering Index (CRI): 97+ / TLCI: 98+ (museum color fidelity)',
      '5600K daylight-balanced continuous output with Bowens mount softbox',
      'Ultra-quiet cooling fan prevents background audio hum during live stream'
    ],
    operationalRole: 'Ensures buyers see exact garment condition, drastically reducing color dispute refunds.',
    maintenanceTip: 'Blow out softbox diffusers monthly with compressed air to prevent studio lint buildup.'
  },
  {
    id: 'gadget-lapel-mic',
    module: 'live',
    category: 'audio_video',
    name: 'Dual Wireless Host Lapel Microphone (32-Bit Float)',
    recommendedModel: 'DJI Mic 2 / RØDE Wireless PRO with Magnetic Clips',
    brand: 'DJI / RØDE',
    connectivity: 'BLUETOOTH',
    status: 'CONNECTED',
    purpose: 'Ultra-clear voice capture over background warehouse noise, ensuring viewer clarity on drop prices.',
    specifications: [
      '32-bit float internal recording eliminates audio clipping during hype calls',
      'Intelligent active noise canceling isolates host voice from packing noise',
      '18-hour total runtime with USB-C quick-charge charging case'
    ],
    operationalRole: 'Guarantees smooth host communication during rapid-fire claim drops.',
    maintenanceTip: 'Use fuzzy deadcat windscreen if studio cooling fans are aimed at host.'
  },

  // 4. COURIER LOGISTICS, PACKING & COD DISPATCH
  {
    id: 'gadget-waybill-printer',
    module: 'dispatch',
    category: 'printer',
    name: 'Standard 4" x 6" Thermal Waybill Shipping Printer',
    recommendedModel: 'Zebra ZD421t (4-inch) / Rollo Wireless Commercial Waybill Printer',
    brand: 'Zebra / Rollo',
    connectivity: 'USB_HID',
    status: 'CONNECTED',
    purpose: 'High-speed output of standard 4x6 courier waybills (Aramex, Emirates Post, DHL, Careem Express).',
    specifications: [
      'Standard format: 4" x 6" (100mm x 150mm) fanfold or roll media',
      'High print speed: 150 mm/second (prints waybill in under 1 second)',
      'Zero-smudge thermal direct printing (water & oil resistant on parcels)',
      'Network ethernet & USB connectivity for multi-packstation sharing'
    ],
    operationalRole: 'Generates dispatch barcode slips and COD collection amounts with zero ink cartridge maintenance.',
    paperSize: '4x6_WAYBILL',
    maintenanceTip: 'Ensure tear bar is kept clean of adhesive residue from peel-and-stick labels.',
    isDefault: true
  },
  {
    id: 'gadget-parcel-scale',
    module: 'dispatch',
    category: 'scale',
    name: 'Heavy Duty Parcel Platform Scale (50kg x 2g)',
    recommendedModel: 'Accuteck ShipPro W-8580 / Dymo Pelouze S50 Platform Scale',
    brand: 'Accuteck / Dymo',
    connectivity: 'USB_HID',
    status: 'CONNECTED',
    purpose: 'Rapid weighing of packed customer cartons & courier polybags to calculate weight surcharges.',
    specifications: [
      'Capacity: 50 kg (accuracy: 2 grams)',
      'Detached backlit LCD console on 1.8m coiled cord (easy reading under large boxes)',
      'Instant Tare & Hold function for oversized courier boxes',
      'Dual power: AC adapter + 9V battery backup'
    ],
    operationalRole: 'Prevents courier re-weigh fines and verifies parcel weight before driver manifest sign-off.',
    maintenanceTip: 'Check zero offset daily before commencing morning dispatch packing runs.',
    isDefault: true
  },
  {
    id: 'gadget-dispatch-scanner',
    module: 'dispatch',
    category: 'scanner',
    name: 'Omnidirectional 2D Courier Hand-Over Scanner',
    recommendedModel: 'Honeywell Xenon 1900g / Datalogic QuickScan QD2400',
    brand: 'Honeywell / Datalogic',
    connectivity: 'USB_HID',
    status: 'CONNECTED',
    purpose: 'Scans parcel waybill tracking barcodes and invoice codes as parcels are handed to courier drivers.',
    specifications: [
      'Area-imaging sensor decodes barcodes in any orientation (360 degrees)',
      'IP41 environmental seal with 1.8m concrete drop spec',
      'Bright green aimer dot with high-visibility target bracket'
    ],
    operationalRole: 'Verifies 100% of dispatched boxes against the courier manifest to prevent lost parcels.',
    maintenanceTip: 'Clean front optical exit window with lint-free optical lens cloth.'
  },
  {
    id: 'gadget-tape-dispenser',
    module: 'dispatch',
    category: 'tool',
    name: 'Electronic Gummed Water-Activated Tape Dispenser',
    recommendedModel: 'Better Packages 555eS / Phoenix M-1 Electronic Kraft Tape Machine',
    brand: 'Better Packages',
    connectivity: 'MANUAL_PHYSICAL',
    status: 'STANDBY',
    purpose: 'Dispenses wet fiberglass-reinforced kraft paper tape that bonds permanently to corrugated carton fibers.',
    specifications: [
      'Programmable length buttons for standard small/medium/large box sizes',
      'Built-in heating element activates starch adhesive in sub-freezing or humid UAE weather',
      'Tamper-evident seal: impossible to open parcel without visible fiber tear'
    ],
    operationalRole: 'Prevents parcel pilferage and internal vintage piece theft during COD transit.',
    maintenanceTip: 'Rinse water reservoir and moistening brushes weekly to prevent starch crystallization.'
  },

  // 5. WAREHOUSE RACKS & PHYSICAL STOREFRONT POS
  {
    id: 'gadget-warehouse-pda',
    module: 'pos_warehouse',
    category: 'tablet_pda',
    name: 'Enterprise Android Barcode Computer (Laser Scan Engine)',
    recommendedModel: 'Zebra TC26 / Honeywell ScanPal EDA52 (Android 13, IP67)',
    brand: 'Zebra / Honeywell',
    connectivity: 'ETHERNET_WIFI',
    status: 'CONNECTED',
    purpose: 'Walk-around inventory stocktakes, aisle rack reorganization, and shop-to-shop transfer auditing.',
    specifications: [
      'Built-in SE4710 1D/2D dedicated hardware laser scan engine',
      '6-foot drop rating onto concrete across full operating temperature',
      'Replaceable 3300mAh battery pack with multi-slot dock charging',
      'Dedicated physical side scan triggers for thumb and forefinger'
    ],
    operationalRole: 'Performs weekly physical cycle counts against GL inventory records with zero laptop dependency.',
    maintenanceTip: 'Clean charging contact pins with contact spray every month.',
    isDefault: true
  },
  {
    id: 'gadget-pos-station',
    module: 'pos_warehouse',
    category: 'printer',
    name: 'Dual-Display All-in-One POS & 80mm Receipt Station',
    recommendedModel: 'Sunmi T2s Dual Screen (15.6" + 10.1") + Star Micronics TSP143',
    brand: 'Sunmi / Star Micronics',
    connectivity: 'ETHERNET_WIFI',
    status: 'CONNECTED',
    purpose: 'Physical storefront showroom checkout with customer-facing VAT and itemized breakdown display.',
    specifications: [
      'Main 15.6" FHD touch screen + Customer 10.1" display with interactive promos',
      'Integrated high-speed 80mm thermal receipt cutter with auto guillotine',
      'RJ12 cash drawer kick port + Ethernet + Dual-band Wi-Fi',
      'Full compliance with UAE Federal Tax Authority (FTA) QR code requirements'
    ],
    operationalRole: 'Processes in-person vintage showroom customer payments, cash drawers, and card payments.',
    paperSize: '80mm_RECEIPT',
    maintenanceTip: 'Inspect thermal printhead for paper dust accumulation weekly.',
    isDefault: true
  },
  {
    id: 'gadget-eas-detacher',
    module: 'pos_warehouse',
    category: 'tool',
    name: 'Super-Lock High Strength Magnetic EAS Detacher & RF Tags',
    recommendedModel: '12,000 Gauss Super-Lock Golf Magnetic Detacher + 58KHz AM Pencil Tags',
    brand: 'Checkpoint / Sensormatic',
    connectivity: 'MANUAL_PHYSICAL',
    status: 'CONNECTED',
    purpose: 'Anti-theft protection for high-value vintage grail jackets, tees, and designer outerwear on retail rails.',
    specifications: [
      '12,000 Gauss rare-earth neodymium magnetic release core',
      'Recessed counter-top mounting lock with key-activated security cover',
      'Compatible with golf, mini-pencil, and spider wrap tags'
    ],
    operationalRole: 'Prevents showroom shoplifting while permitting customer touch and inspection on retail rails.',
    maintenanceTip: 'Keep magnetic core away from magnetic stripe cards and smart watches.'
  }
];

export const DEFAULT_WORKSTATIONS: WorkstationProfile[] = [
  {
    id: 'ws-dock-01',
    stationName: 'Al Quoz Container Unloading Bay (Dock 1)',
    location: 'Warehouse Gate A - Bay 1',
    module: 'purchase',
    operatorName: 'Tariq Mansoor (Dock Master)',
    activeScaleId: 'gadget-crane-scale',
    activeScannerId: 'gadget-dock-tablet',
    scaleTareOffset: 2500, // 2.5kg tare for standard dock sling
    scaleUnit: 'KG',
    soundAlerts: true,
    autoPrintOnExtract: false,
    autoPrintOnWaybill: false
  },
  {
    id: 'ws-sorting-01',
    stationName: 'Bale Breakdown & Grading Bench #1',
    location: 'Main Sorting Floor - Station 1',
    module: 'sorting',
    operatorName: 'Bilal Ahmed (Senior Grader)',
    activeScaleId: 'gadget-bench-scale',
    activePrinterId: 'gadget-label-printer',
    activeScannerId: 'gadget-ring-scanner',
    scaleTareOffset: 12, // 12g tare for acrylic weighing bowl
    scaleUnit: 'G',
    soundAlerts: true,
    autoPrintOnExtract: true,
    autoPrintOnWaybill: false
  },
  {
    id: 'ws-live-01',
    stationName: 'TikTok & IG Live Selling Studio A',
    location: 'Studio Room 102 - 1st Floor',
    module: 'live',
    operatorName: 'Zayd & Sara (Live Hosts)',
    activeScannerId: 'gadget-live-scanner',
    scaleTareOffset: 0,
    scaleUnit: 'G',
    soundAlerts: true,
    autoPrintOnExtract: false,
    autoPrintOnWaybill: false
  },
  {
    id: 'ws-dispatch-01',
    stationName: 'Courier Packing & Waybill Station #1',
    location: 'Outbound Logistics Hub - Bench 2',
    module: 'dispatch',
    operatorName: 'Rashid Khan (Dispatch Lead)',
    activeScaleId: 'gadget-parcel-scale',
    activePrinterId: 'gadget-waybill-printer',
    activeScannerId: 'gadget-dispatch-scanner',
    scaleTareOffset: 65, // 65g tare for standard polybag + bubble pouch
    scaleUnit: 'KG',
    soundAlerts: true,
    autoPrintOnExtract: false,
    autoPrintOnWaybill: true
  },
  {
    id: 'ws-retail-01',
    stationName: 'Vintage Vibe Flagship Showroom POS',
    location: 'Al Quoz Flagship Storefront',
    module: 'pos_warehouse',
    operatorName: 'Amina Al-Falasi (Store Cashier)',
    activePrinterId: 'gadget-pos-station',
    activeScannerId: 'gadget-warehouse-pda',
    scaleTareOffset: 0,
    scaleUnit: 'KG',
    soundAlerts: true,
    autoPrintOnExtract: false,
    autoPrintOnWaybill: false
  }
];
