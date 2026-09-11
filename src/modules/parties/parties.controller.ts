import { Party, PartyKhataLog } from './parties.types.ts';
import { relationalStore } from '../../db/relationalStore.ts';

export class PartiesController {
  public static getParties(type?: string): Party[] {
    let parties = relationalStore.getParties();
    if (type) {
      parties = parties.filter(p => p.type === type);
    }
    return parties;
  }

  public static getPartyById(id: string): Party | undefined {
    return relationalStore.getParties().find(p => p.id === id);
  }

  public static addParty(partyData: Omit<Party, 'id' | 'code' | 'currentBalance' | 'accountMap' | 'createdAt'>): Party {
    return relationalStore.addParty(partyData);
  }

  public static getPartyKhata(partyId: string): PartyKhataLog[] {
    return relationalStore.getPartyKhataLogs(partyId);
  }

  public static recordPaymentOrReceipt(partyId: string, payload: {
    amount: number;
    type: 'RECEIPT' | 'PAYMENT';
    docRef: string;
    description: string;
  }): { success: boolean; khataLog?: PartyKhataLog; error?: string } {
    return relationalStore.recordPartyPayment(partyId, payload);
  }
}
