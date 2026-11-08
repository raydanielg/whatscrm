import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useRecordPayment, type PaymentMethod } from '@/hooks/use-invoices';
import { DatePicker } from '@/shared/components';
import { format as fmtDate, parseISO } from 'date-fns';

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  invoiceId: string;
  maxAmount: number;
  currency: string;
};

export function RecordPaymentDialog({ open, onOpenChange, invoiceId, maxAmount, currency }: Props) {
  const record = useRecordPayment();
  const [amount, setAmount] = useState<number>(Number(maxAmount.toFixed(2)));
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));

  const money = (n: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n || 0);

  const submit = async () => {
    if (!amount || amount <= 0) return toast.error('Amount must be greater than zero');
    try {
      await record.mutateAsync({
        invoice_id: invoiceId,
        amount,
        method,
        reference: reference || null,
        notes: notes || null,
        paid_at: new Date(paidAt).toISOString(),
      });
      toast.success('Payment recorded');
      onOpenChange(false);
      setReference(''); setNotes('');
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Amount</Label>
            <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            <div className="text-xs text-muted-foreground mt-1">Outstanding: {money(maxAmount)}</div>
          </div>
          <div>
            <Label>Method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="stripe">Stripe</SelectItem>
                <SelectItem value="paypal">PayPal</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="check">Check</SelectItem>
                <SelectItem value="crypto">Crypto</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Payment date</Label>
            <DatePicker
              value={paidAt ? parseISO(paidAt) : undefined}
              onChange={(d) => setPaidAt(d ? fmtDate(d, 'yyyy-MM-dd') : '')}
            />
          </div>
          <div>
            <Label>Reference (optional)</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transaction ID / bank reference" />
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={record.isPending}>{record.isPending ? 'Recording' : 'Record payment'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
