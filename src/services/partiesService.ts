import { supabase } from '../supabaseClient.ts';
import { Party, PartyKhataLog } from '../modules/parties/parties.types.ts';

export class PartiesService {
  public static async getParties(): Promise<Party[]> {
    const { data, error } = await supabase
      .from('parties')
      .select('*')
      .order('name');

    if (error) {
      console.error('Supabase error on parties:', error);
      throw new Error(error.message || 'Database error occurred reading parties');
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      type: row.type || 'CLIENT',
      contactPerson: row.contact_person || row.contactPerson || '',
      phone: row.phone || '',
      email: row.email || '',
      address: row.address || '',
      trnNo: row.trn_no || row.trnNo || '',
      creditLimit: Number(row.credit_limit ?? row.creditLimit ?? 0),
      currentBalance: Number(row.current_balance ?? row.currentBalance ?? 0),
      currency: row.currency || 'AED',
      isActive: row.is_active !== false && row.isActive !== false,
      accountMap: row.account_map || row.accountMap || {},
      createdAt: row.created_at || new Date().toISOString()
    }));
  }

  public static async addParty(party: Partial<Party>): Promise<Party> {
    const id = party.id || `pty-${Date.now()}`;
    const payload = {
      id,
      code: party.code || `P-${Date.now().toString().slice(-4)}`,
      name: party.name,
      type: party.type || 'CLIENT',
      contact_person: party.contactPerson || '',
      phone: party.phone || '',
      email: party.email || '',
      address: party.address || '',
      trn_no: party.trnNo || '',
      credit_limit: Number(party.creditLimit || 0),
      current_balance: Number(party.currentBalance || 0),
      currency: party.currency || 'AED',
      is_active: party.isActive !== false,
      account_map: party.accountMap || {}
    };

    const { data, error } = await supabase
      .from('parties')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Supabase error on parties:', error);
      throw new Error(error.message || 'Failed to save party');
    }

    return {
      id: data.id,
      code: data.code,
      name: data.name,
      type: data.type,
      contactPerson: data.contact_person,
      phone: data.phone,
      email: data.email,
      address: data.address,
      trnNo: data.trn_no,
      creditLimit: Number(data.credit_limit),
      currentBalance: Number(data.current_balance),
      currency: data.currency,
      isActive: data.is_active,
      createdAt: data.created_at
    };
  }

  public static async updateParty(id: string, updates: Partial<Party>): Promise<Party> {
    const payload: any = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.type !== undefined) payload.type = updates.type;
    if (updates.contactPerson !== undefined) payload.contact_person = updates.contactPerson;
    if (updates.phone !== undefined) payload.phone = updates.phone;
    if (updates.email !== undefined) payload.email = updates.email;
    if (updates.address !== undefined) payload.address = updates.address;
    if (updates.trnNo !== undefined) payload.trn_no = updates.trnNo;
    if (updates.creditLimit !== undefined) payload.credit_limit = Number(updates.creditLimit);
    if (updates.currentBalance !== undefined) payload.current_balance = Number(updates.currentBalance);
    if (updates.isActive !== undefined) payload.is_active = updates.isActive;

    const { data, error } = await supabase
      .from('parties')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Supabase error on parties:', error);
      throw new Error(error.message || 'Failed to update party');
    }

    return {
      id: data.id,
      code: data.code,
      name: data.name,
      type: data.type,
      contactPerson: data.contact_person,
      phone: data.phone,
      email: data.email,
      address: data.address,
      trnNo: data.trn_no,
      creditLimit: Number(data.credit_limit),
      currentBalance: Number(data.current_balance),
      currency: data.currency,
      isActive: data.is_active,
      createdAt: data.created_at
    };
  }

  public static async deleteParty(id: string): Promise<void> {
    const { error } = await supabase.from('parties').delete().eq('id', id);
    if (error) {
      console.error('Supabase error on parties:', error);
      throw new Error(error.message || 'Failed to delete party');
    }
  }

  // --- Khata Logs ---
  public static async getKhataLogs(partyId?: string): Promise<PartyKhataLog[]> {
    let query = supabase.from('party_khata_logs').select('*').order('date', { ascending: false });
    if (partyId) {
      query = query.eq('party_id', partyId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Supabase error on party_khata_logs:', error);
      throw new Error(error.message || 'Database error occurred reading Khata logs');
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      partyId: row.party_id || row.partyId,
      date: row.date,
      reference: row.reference || '',
      debit: Number(row.debit || 0),
      credit: Number(row.credit || 0),
      runningBalance: Number(row.running_balance ?? row.runningBalance ?? 0),
      notes: row.notes || '',
      createdAt: row.created_at
    }));
  }

  public static async addKhataLog(log: Partial<PartyKhataLog>): Promise<PartyKhataLog> {
    const id = log.id || `kht-${Date.now()}`;
    const payload = {
      id,
      party_id: log.partyId,
      date: log.date || new Date().toISOString().slice(0, 10),
      reference: log.reference || '',
      debit: Number(log.debit || 0),
      credit: Number(log.credit || 0),
      running_balance: Number(log.runningBalance || 0),
      notes: log.notes || ''
    };

    const { data, error } = await supabase
      .from('party_khata_logs')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('Supabase error on party_khata_logs:', error);
      throw new Error(error.message || 'Failed to add Khata entry');
    }

    return {
      id: data.id,
      partyId: data.party_id,
      date: data.date,
      reference: data.reference,
      debit: Number(data.debit),
      credit: Number(data.credit),
      runningBalance: Number(data.running_balance),
      notes: data.notes
    };
  }
}
