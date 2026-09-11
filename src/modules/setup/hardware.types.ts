export type ModuleAffinity = 
  | 'purchase'       // Inward Ocean Freight & Bales Receiving
  | 'sorting'        // Bale Sorting & Piece Cataloging
  | 'live'           // Live Selling Studio (TikTok/IG/Whatnot)
  | 'dispatch'       // Logistics, Packing & COD Courier Dispatch
  | 'pos_warehouse'; // Warehouse Racks & Physical Storefront POS

export type GadgetCategory = 
  | 'scale'
  | 'printer'
  | 'scanner'
  | 'tablet_pda'
  | 'audio_video'
  | 'payment_terminal'
  | 'tool';

export type ConnectivityType = 
  | 'USB_HID'
  | 'RS232_SERIAL'
  | 'BLUETOOTH'
  | 'ETHERNET_WIFI'
  | 'MANUAL_PHYSICAL';

export type DeviceStatus = 'CONNECTED' | 'STANDBY' | 'DISCONNECTED' | 'EMULATED';

export interface HardwareGadget {
  id: string;
  module: ModuleAffinity;
  category: GadgetCategory;
  name: string;
  recommendedModel: string;
  brand: string;
  connectivity: ConnectivityType;
  status: DeviceStatus;
  purpose: string;
  specifications: string[];
  operationalRole: string;
  maintenanceTip?: string;
  baudRate?: number;
  ipAddress?: string;
  port?: number;
  paperSize?: '50x25mm_TAG' | '4x6_WAYBILL' | '80mm_RECEIPT';
  isDefault?: boolean;
}

export interface WorkstationProfile {
  id: string;
  stationName: string;
  location: string;
  module: ModuleAffinity;
  operatorName: string;
  activeScaleId?: string;
  activePrinterId?: string;
  activeScannerId?: string;
  scaleTareOffset: number; // in grams
  scaleUnit: 'G' | 'KG' | 'LB';
  soundAlerts: boolean;
  autoPrintOnExtract: boolean;
  autoPrintOnWaybill: boolean;
}

export interface BarcodeScanTestEvent {
  id: string;
  timestamp: string;
  rawBarcode: string;
  detectedFormat: string;
  latencyMs: number;
  success: boolean;
  prefixMatched?: boolean;
}

export interface POSTerminalConfig {
  id: string;
  terminalName: string;
  model: 'SUNMI_P2' | 'PAX_A920' | 'INGENICO_MOVE5000' | 'VERIFONE_V240M' | 'STRIPE_TERMINAL' | 'NETWORK_IP_PED' | 'UNIVERSAL_SIMULATOR';
  connectionType: 'LAN_ETHERNET' | 'WIFI_IP' | 'USB_SERIAL' | 'BLUETOOTH' | 'CLOUD_BRIDGE' | 'SIMULATOR';
  ipAddress?: string;
  port?: number;
  terminalId: string; // TID
  merchantId: string; // MID
  status: 'ONLINE' | 'OFFLINE' | 'BUSY';
  clearingAccountId: string; // e.g. acc-1125 POS Card Clearing
  linkedBankAccountId?: string; // Linked Bank Account ID for Card Settlement
  linkedBankName?: string; // e.g. Emirates NBD
  settlementCoaAccountCode?: string; // e.g. 1120-00
  autoPrintCustomerReceipt: boolean;
  autoPrintMerchantSlip: boolean;
  allowApplePayNfc: boolean;
  allowGooglePayNfc: boolean;
  allowContactlessChip: boolean;
  currency: string;
  lastPingAt?: string;
  terminalModel?: string;
  terminalIp?: string;
  autoConfirmToCOA?: boolean;
  simulateMachine?: boolean;
}

