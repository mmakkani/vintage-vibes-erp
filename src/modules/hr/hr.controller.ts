import { Employee, AttendanceRecord, PayrollRecord } from './hr.types.ts';
import { relationalStore } from '../../db/relationalStore.ts';
import { GoogleGenAI } from '@google/genai';

export interface AIOCRScanPayload {
  documentType: 'EMIRATES_ID' | 'PASSPORT' | 'RESIDENCY_VISA' | 'AUTO_DETECT';
  imageBase64?: string;
  secondaryImageBase64?: string; // e.g. Back of Emirates ID
  images?: string[]; // Multiple document images batch array
  imagesBase64?: string[]; // Multiple document images batch array (alias)
  apiKey?: string;
}

export interface AIOCRScanResult {
  success: boolean;
  documentType: 'EMIRATES_ID' | 'PASSPORT' | 'RESIDENCY_VISA';
  name: string;
  nameArabic?: string;
  emiratesId?: string;
  idCardNo?: string;
  dob?: string;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  nationality?: string;
  emiratesIdExpiry?: string;
  passportNo?: string;
  passportCountry?: string;
  passportIssueDate?: string;
  passportExpiry?: string;
  residencyCardNo?: string;
  uidNo?: string;
  residencyProfession?: string;
  residencySponsor?: string;
  residencyIssueDate?: string;
  residencyExpiryDate?: string;
  confidence: number;
  source: 'GEMINI_AI_VISION' | 'DEMO_PRESET_PARSER';
  idFrontImageUrl?: string;
  idBackImageUrl?: string;
  passportImageUrl?: string;
  residencyImageUrl?: string;
  notes?: string;
  error?: string;
}

export class HRController {
  public static getEmployees(): Employee[] {
    return relationalStore.getEmployees();
  }

  public static addEmployee(empData: Omit<Employee, 'id' | 'empCode'>): Employee {
    return relationalStore.addEmployee(empData);
  }

  public static updateEmployee(id: string, empData: Partial<Employee>): Employee {
    return relationalStore.updateEmployee(id, empData);
  }

  public static postEmployee(id: string): { success: boolean; error?: string } {
    return relationalStore.postEmployee(id);
  }

  public static unpostEmployee(id: string): { success: boolean; error?: string } {
    return relationalStore.unpostEmployee(id);
  }

  public static deleteEmployee(id: string): { success: boolean; error?: string } {
    return relationalStore.deleteEmployee(id);
  }

  public static getAttendance(monthYear: string): AttendanceRecord[] {
    return relationalStore.getAttendance(monthYear);
  }

  public static getAttendanceSheetsLog() {
    return relationalStore.getAttendanceSheetsLog();
  }

  public static updateAttendance(recordId: string, daysWorked: number, overtimeHours: number): AttendanceRecord {
    return relationalStore.updateAttendance(recordId, daysWorked, overtimeHours);
  }

  public static createAttendanceSheet(monthYear: string): { success: boolean; records?: AttendanceRecord[]; error?: string } {
    return relationalStore.createAttendanceSheet(monthYear);
  }

  public static deleteAttendanceSheet(monthYear: string): { success: boolean; error?: string } {
    return relationalStore.deleteAttendanceSheet(monthYear);
  }

  public static postAttendanceSheet(monthYear: string, postedBy: string): { success: boolean; count: number; error?: string } {
    return relationalStore.postAttendanceSheet(monthYear, postedBy);
  }

  public static unpostAttendanceSheet(monthYear: string): { success: boolean; error?: string } {
    return relationalStore.unpostAttendanceSheet(monthYear);
  }

  public static getPayroll(monthYear: string): PayrollRecord[] {
    return relationalStore.getPayroll(monthYear);
  }

  public static getPayrollSheetsLog() {
    return relationalStore.getPayrollSheetsLog();
  }

  public static runPayroll(monthYear: string): { success: boolean; records?: PayrollRecord[]; errors?: string[] } {
    return relationalStore.runPayrollCalculation(monthYear);
  }

  public static updatePayrollDeductions(slipId: string, advanceDeduction: number, loanEmiDeduction: number): { success: boolean; slip?: PayrollRecord; error?: string } {
    return relationalStore.updatePayrollSlipDeductions(slipId, advanceDeduction, loanEmiDeduction);
  }

  public static postPayroll(monthYear: string, postedBy: string, paymentMethod?: 'CASH' | 'BANK_TRANSFER', bankAccountId?: string): { success: boolean; error?: string } {
    return relationalStore.postPayroll(monthYear, postedBy, paymentMethod, bankAccountId);
  }

  public static deletePayroll(monthYear: string): { success: boolean; error?: string } {
    return relationalStore.deletePayroll(monthYear);
  }

  public static unpostPayroll(monthYear: string): { success: boolean; error?: string } {
    return relationalStore.unpostPayroll(monthYear);
  }

  public static getEmployeeLoans(employeeId?: string) {
    return relationalStore.getEmployeeLoans(employeeId);
  }

  public static createEmployeeLoan(data: any) {
    return relationalStore.createEmployeeLoan(data);
  }

  public static deleteEmployeeLoan(loanId: string) {
    return relationalStore.deleteEmployeeLoan(loanId);
  }

  public static getOcrConfigStatus() {
    return {
      configured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 5),
      model: 'gemini-3.7-flash'
    };
  }

  /**
   * High-accuracy Google Gemini AI Vision OCR for UAE Emirates ID (Front & Back),
   * Passport, and UAE Residency Card / Visa with multi-document batch cross-referencing.
   */
  public static async performAIOCRScan(payload: AIOCRScanPayload): Promise<AIOCRScanResult> {
    const { documentType, apiKey: clientApiKey } = payload;
    const apiKey = (clientApiKey && clientApiKey.trim().length > 5)
      ? clientApiKey.trim()
      : (process.env.GEMINI_API_KEY || '').trim();

    // Helper to clean base64 string
    const cleanBase64 = (b64: string) => b64.replace(/^data:image\/[a-zA-Z0-9.+]+;base64,/, '');
    const detectMime = (b64: string) => {
      const match = b64.match(/^data:(image\/[a-zA-Z0-9.+]+);base64,/);
      return match ? match[1] : 'image/jpeg';
    };

    // Gather all document images from payload
    const rawImages: string[] = (Array.isArray(payload.images) && payload.images.length > 0)
      ? payload.images.filter(img => typeof img === 'string' && img.trim().length > 100)
      : (Array.isArray(payload.imagesBase64) && payload.imagesBase64.length > 0)
        ? payload.imagesBase64.filter(img => typeof img === 'string' && img.trim().length > 100)
        : [payload.imageBase64, payload.secondaryImageBase64].filter((img): img is string => typeof img === 'string' && img.trim().length > 100);

    if (rawImages.length === 0) {
      throw new Error('Please upload or capture at least one clear document photo to scan.');
    }

    if (apiKey) {
      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: { 'User-Agent': 'vintage-vibe-emirates-ocr' }
          }
        });

        const promptText = `I am providing multiple images of a person's legal documents (e.g., Passport, Emirates ID, Visa). Cross-reference all provided images to extract a single, comprehensive JSON profile. Fill in missing gaps from one document using the others.

MANDATORY RULES:
1. Identify all present legal documents: Emirates ID (Front and/or Back), Passport Bio Page, and UAE Residency Visa / Card.
2. Cross-reference all provided images to extract a single, unified, comprehensive JSON profile:
   - For Emirates ID:
     * Full Name in English
     * Full Name in Arabic (الاسم بالعربية as printed on card)
     * Emirates ID Number in standard format 784-YYYY-XXXXXXX-X
     * Card Number / Serial Number (found on the back of card or near chip)
     * Date of Birth in YYYY-MM-DD format
     * Expiry Date in YYYY-MM-DD format
     * Nationality (e.g. United Arab Emirates, Pakistan, India, Egypt, etc.)
     * Gender: 'MALE' or 'FEMALE'
   - For Passport:
     * Passport Number
     * Full Name (Given name + Surname)
     * Nationality / Issuing Country
     * Date of Birth (YYYY-MM-DD)
     * Gender ('MALE' or 'FEMALE')
     * Date of Issue (YYYY-MM-DD)
     * Date of Expiry (YYYY-MM-DD)
   - For UAE Residency Visa / Card:
     * File Number / Residency Number (e.g. 201/YYYY/XXXXXXX)
     * Unified Number / UID No (9 digits)
     * Full Name in English and Arabic
     * Profession / Designation (as printed on visa)
     * Sponsor / Employer Name
     * Issue Date (YYYY-MM-DD)
     * Expiry Date (YYYY-MM-DD)

3. Unified Profile Reconciliation:
   - Harmonize and merge values across documents. Fill in missing gaps from one document using the others (e.g., if Name in English or Nationality is in Passport, and Emirates ID has Arabic name and UID, combine them into one profile).
   - For documentType, specify 'EMIRATES_ID' if an Emirates ID is present, otherwise 'PASSPORT' or 'RESIDENCY_VISA'.

4. Return ONLY a pure JSON object matching this schema without any markdown formatting or commentary:
{
  "documentType": "EMIRATES_ID",
  "name": "Full Name in English",
  "nameArabic": "الاسم بالعربية",
  "emiratesId": "784-YYYY-XXXXXXX-X",
  "idCardNo": "Card Serial",
  "dob": "YYYY-MM-DD",
  "gender": "MALE",
  "nationality": "United Arab Emirates",
  "emiratesIdExpiry": "YYYY-MM-DD",
  "passportNo": "A12345678",
  "passportCountry": "Country",
  "passportIssueDate": "YYYY-MM-DD",
  "passportExpiry": "YYYY-MM-DD",
  "residencyCardNo": "201/2024/7654321",
  "uidNo": "123456789",
  "residencyProfession": "Designation",
  "residencySponsor": "VINTAGE VIBES GENERAL TRADING LLC",
  "residencyIssueDate": "YYYY-MM-DD",
  "residencyExpiryDate": "YYYY-MM-DD",
  "confidence": 0.98
}`;

        // Construct parts array containing prompt and all document images in a single request
        const parts: any[] = [];
        parts.push({ text: promptText });
        for (const img of rawImages) {
          parts.push({
            inlineData: {
              mimeType: detectMime(img),
              data: cleanBase64(img)
            }
          });
        }

        const candidateModels = [
          'gemini-3.7-flash',
          'gemini-3-flash',
          'gemini-3.8-flash',
          'gemini-3.6-flash',
          'gemini-2.0-flash',
          'gemini-2.5-flash',
          'gemini-1.5-flash'
        ];
        let lastModelErr: any = null;
        let response: any = null;
        let successfulModel = 'gemini-3.7-flash';
        for (const m of candidateModels) {
          try {
            response = await ai.models.generateContent({
              model: m,
              contents: { parts }
            });
            if (response?.text) {
              successfulModel = m;
              break;
            }
          } catch (mErr) {
            lastModelErr = mErr;
          }
        }
        if (!response?.text) throw lastModelErr || new Error('AI Vision OCR extraction failed.');

        const text = response.text || '';
        const cleanJson = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanJson);

        return {
          success: true,
          documentType: parsed.documentType || (documentType !== 'AUTO_DETECT' ? documentType : 'EMIRATES_ID'),
          name: parsed.name || 'Extracted Name',
          nameArabic: parsed.nameArabic || '',
          emiratesId: parsed.emiratesId || '',
          idCardNo: parsed.idCardNo || '',
          dob: parsed.dob || '',
          gender: parsed.gender === 'FEMALE' ? 'FEMALE' : 'MALE',
          nationality: parsed.nationality || 'United Arab Emirates',
          emiratesIdExpiry: parsed.emiratesIdExpiry || '',
          passportNo: parsed.passportNo || '',
          passportCountry: parsed.passportCountry || parsed.nationality || '',
          passportIssueDate: parsed.passportIssueDate || '',
          passportExpiry: parsed.passportExpiry || '',
          residencyCardNo: parsed.residencyCardNo || '',
          uidNo: parsed.uidNo || '',
          residencyProfession: parsed.residencyProfession || '',
          residencySponsor: parsed.residencySponsor || 'VINTAGE VIBES GENERAL TRADING L.L.C',
          residencyIssueDate: parsed.residencyIssueDate || '',
          residencyExpiryDate: parsed.residencyExpiryDate || '',
          confidence: Number(parsed.confidence) || 0.98,
          source: 'GEMINI_AI_VISION',
          idFrontImageUrl: payload.imageBase64 || (rawImages.length > 0 ? rawImages[0] : ''),
          idBackImageUrl: payload.secondaryImageBase64 || (rawImages.length > 1 ? rawImages[1] : ''),
          passportImageUrl: documentType === 'PASSPORT' ? (payload.imageBase64 || rawImages[0]) : '',
          residencyImageUrl: documentType === 'RESIDENCY_VISA' ? (payload.imageBase64 || rawImages[0]) : '',
          notes: `Batch cross-referenced ${rawImages.length} document image${rawImages.length > 1 ? 's' : ''} via Gemini Vision AI`,
          modelUsed: successfulModel
        };
      } catch (geminiErr: any) {
        console.warn('Gemini OCR Vision call warning:', geminiErr?.message);
        // Fall back to intelligent local parser if Gemini throws or rate-limited
      }
    }

    // Clean response when AI Vision OCR extraction cannot be performed
    const detectedType = documentType === 'AUTO_DETECT' ? 'EMIRATES_ID' : documentType;

    return {
      success: false,
      documentType: detectedType as 'EMIRATES_ID' | 'PASSPORT' | 'RESIDENCY_VISA',
      name: '',
      nameArabic: '',
      emiratesId: '',
      idCardNo: '',
      dob: '',
      gender: 'MALE',
      nationality: '',
      emiratesIdExpiry: '',
      passportNo: '',
      passportCountry: '',
      passportIssueDate: '',
      passportExpiry: '',
      residencyCardNo: '',
      uidNo: '',
      residencyProfession: '',
      residencySponsor: '',
      residencyIssueDate: '',
      residencyExpiryDate: '',
      confidence: 0,
      source: 'MANUAL_ENTRY',
      idFrontImageUrl: payload.imageBase64 || (rawImages.length > 0 ? rawImages[0] : ''),
      idBackImageUrl: payload.secondaryImageBase64 || (rawImages.length > 1 ? rawImages[1] : ''),
      passportImageUrl: detectedType === 'PASSPORT' ? (payload.imageBase64 || (rawImages.length > 0 ? rawImages[0] : '')) : '',
      residencyImageUrl: detectedType === 'RESIDENCY_VISA' ? (payload.imageBase64 || (rawImages.length > 0 ? rawImages[0] : '')) : '',
      notes: apiKey ? 'AI Vision extraction failed. Please enter document details manually.' : 'Gemini API key not configured. Please enter document details manually.'
    };
  }
}

