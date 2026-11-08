import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Loader2, Heart, ShoppingCart, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { myListWishlist, myToggleWishlist, myAddToCart } from '@/lib/commerce/client-checkout.functions';
import { Button } from '@/components/ui/button';

import { useCurrencyFormatter } from "@/hooks/use-currency";
export const Route = createFileRoute('/_authenticated/client/wishlist')({ component: WishlistPage });

function WishlistPage() {
  const money = useCurrencyFormatter({ locale: "en-US" });
  const qc = useQueryClient();
  const list = useServerFn(myListWishlist);
  const toggle = useServerFn(myToggleWishlist);
  const addCart = useServerFn(myAddToCart);
  const q = useQuery({ queryKey: ['client-wishlist'], queryFn: () => list() });

  const removeM = useMutation({
    mutationFn: (productId: string) => toggle({ data: { productId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client-wishlist'] }),
  });
  const addM = useMutation({
    mutationFn: (productId: string) => addCart({ data: { productId, quantity: 1 } }),
    onSuccess: () => { toast.success('Added to cart'); qc.invalidateQueries({ queryKey: ['client-cart'] }); },
  });

  if (q.isLoading) return <div className="p-8"><Loader2 className="w-4 h-4 animate-spin" /></div>;
  const items = (q.data as Array<{ id: string; product_id: string | null; product: { id: string; name: string; price: number | null; sale_price: number | null; sku: string | null; image_url: string | null } | null }> | undefined) ?? [];

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2">
        <Heart className="w-5 h-5" />
        <h2 className="font-display text-2xl font-semibold">Wishlist</h2>
      </header>

      {items.length === 0 ? (
        <div className="rounded-control border border-border bg-surface p-10 text-center text-sm text-muted-foreground">
          You haven't saved any items yet.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((w) => {
            const p = w.product;
            if (!p) return null;
            const price = p.sale_price ?? p.price ?? 0;
            return (
              <div key={w.id} className="rounded-control border border-border bg-surface p-4 space-y-3">
                {p.image_url && <img src={p.image_url} alt={p.name} className="w-full h-32 object-cover rounded-control" />}
                <div>
                  <p className="font-medium truncate">{p.name}</p>
                  <p className="text-sm text-muted-foreground">{money(Number(price))}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" onClick={() => addM.mutate(p.id)}>
                    <ShoppingCart className="w-3 h-3 " /> Add to cart
                  </Button>
                  <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => removeM.mutate(p.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
