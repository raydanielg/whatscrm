import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { Loader2, Minus, Plus, ShoppingCart, Trash2, Tag, Bookmark } from 'lucide-react';
import { toast } from 'sonner';
import {
  myGetCart, myUpdateCartItem, myRemoveCartItem, myApplyCoupon, myRemoveCoupon, mySaveCartForLater,
} from '@/lib/commerce/client-checkout.functions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { useCurrencyFormatter } from "@/hooks/use-currency";
export const Route = createFileRoute('/_authenticated/client/cart')({ component: CartPage });

function CartPage() {
  const money = useCurrencyFormatter({ locale: "en-US" });
  const qc = useQueryClient();
  const getCart = useServerFn(myGetCart);
  const updateItem = useServerFn(myUpdateCartItem);
  const removeItem = useServerFn(myRemoveCartItem);
  const applyCoupon = useServerFn(myApplyCoupon);
  const removeCoupon = useServerFn(myRemoveCoupon);
  const saveCart = useServerFn(mySaveCartForLater);

  const q = useQuery({ queryKey: ['client-cart'], queryFn: () => getCart() });
  const [code, setCode] = useState('');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['client-cart'] });

  const updateM = useMutation({
    mutationFn: (v: { itemId: string; quantity: number }) => updateItem({ data: v }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });
  const removeM = useMutation({
    mutationFn: (itemId: string) => removeItem({ data: { itemId } }),
    onSuccess: invalidate,
  });
  const applyM = useMutation({
    mutationFn: (v: { cartId: string; code: string }) => applyCoupon({ data: v }),
    onSuccess: () => { setCode(''); toast.success('Coupon applied'); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const removeCM = useMutation({
    mutationFn: (cartId: string) => removeCoupon({ data: { cartId } }),
    onSuccess: invalidate,
  });
  const saveM = useMutation({
    mutationFn: (cartId: string) => saveCart({ data: { cartId } }),
    onSuccess: () => toast.success('Cart saved for later'),
  });

  if (q.isLoading) return <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading</div>;
  const cart = q.data?.cart as { id: string; currency: string; coupon_code: string | null; subtotal: number; discount: number; shipping: number; tax: number; total: number } | undefined;
  const items = q.data?.items ?? [];
  if (!cart) return null;

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2">
        <ShoppingCart className="w-5 h-5" />
        <h2 className="font-display text-2xl font-semibold">Cart</h2>
      </header>

      {items.length === 0 ? (
        <div className="rounded-control border border-border bg-surface p-10 text-center">
          <p className="text-sm text-muted-foreground">Your cart is empty.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-2">
            {items.map((it: { id: string; name: string; sku: string | null; quantity: number; unit_price: number; total: number }) => (
              <div key={it.id} className="rounded-control border border-border bg-surface p-4 flex items-center gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{it.name}</p>
                  {it.sku && <p className="text-xs text-muted-foreground">SKU {it.sku}</p>}
                  <p className="text-xs text-muted-foreground mt-1">{money(it.unit_price, cart.currency)} each</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="outline" className="h-9 w-9"
                    onClick={() => updateM.mutate({ itemId: it.id, quantity: Math.max(0, it.quantity - 1) })}><Minus className="w-3 h-3" /></Button>
                  <span className="w-8 text-center text-sm">{it.quantity}</span>
                  <Button size="icon" variant="outline" className="h-9 w-9"
                    onClick={() => updateM.mutate({ itemId: it.id, quantity: it.quantity + 1 })}><Plus className="w-3 h-3" /></Button>
                </div>
                <div className="w-24 text-right font-semibold">{money(it.total, cart.currency)}</div>
                <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => removeM.mutate(it.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>

          <aside className="rounded-control border border-border bg-surface p-4 space-y-3 h-fit">
            <h3 className="font-semibold">Order summary</h3>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{money(cart.subtotal, cart.currency)}</span></div>
              {cart.discount > 0 && <div className="flex justify-between text-emerald-600"><span>Discount</span><span>−{money(cart.discount, cart.currency)}</span></div>}
              {cart.shipping > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Shipping</span><span>{money(cart.shipping, cart.currency)}</span></div>}
              {cart.tax > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{money(cart.tax, cart.currency)}</span></div>}
              <div className="border-t border-border pt-2 flex justify-between font-semibold text-base"><span>Total</span><span>{money(cart.total, cart.currency)}</span></div>
            </div>

            <div className="space-y-2 pt-2 border-t border-border">
              <div className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Tag className="w-3 h-3" /> Promo code</div>
              {cart.coupon_code ? (
                <div className="flex items-center justify-between rounded-control bg-muted/40 px-2 py-1 text-sm">
                  <span className="font-mono">{cart.coupon_code}</span>
                  <Button variant="ghost" size="sm" className="h-6" onClick={() => removeCM.mutate(cart.id)}>Remove</Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Enter code" className="h-9" />
                  <Button className="h-9" disabled={!code || applyM.isPending} onClick={() => applyM.mutate({ cartId: cart.id, code })}>Apply</Button>
                </div>
              )}
            </div>

            <Button asChild className="w-full h-9"><Link to="/client/checkout">Checkout</Link></Button>
            <Button variant="outline" className="w-full h-9" onClick={() => saveM.mutate(cart.id)}>
              <Bookmark className="w-4 h-4 " /> Save for later
            </Button>
          </aside>
        </div>
      )}
    </div>
  );
}
