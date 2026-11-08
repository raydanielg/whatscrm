import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CreditCard,
  Loader2,
  LockKeyhole,
  MapPin,
  PackageCheck,
  Tag,
  Truck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  myApplyPromoCode,
  myApplyTax,
  myGetCart,
  myListAddresses,
  myListShipping,
  myPlaceOrder,
  myRemovePromoCode,
  mySaveAddress,
  mySelectShipping,
} from "@/lib/commerce/client-checkout.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useCurrencyFormatter } from "@/hooks/use-currency";

export const Route = createFileRoute("/_authenticated/client/checkout")({
  component: CheckoutPage,
});

type Address = {
  street1: string;
  street2?: string;
  city: string;
  region?: string;
  postal_code: string;
  country: string;
  name?: string;
};

type SavedAddress = Address & { id: string; label: string | null };
type CheckoutStep = 0 | 1 | 2;
type PaymentMethod = "card" | "cod" | "bank_transfer" | "wallet" | "payment_link";

const STEPS = ["Delivery", "Payment", "Review"] as const;
const EMPTY_SAVED_ADDRESSES: SavedAddress[] = [];
const PAYMENT_METHODS: Array<{
  value: PaymentMethod;
  label: string;
  description: string;
}> = [
  {
    value: "card",
    label: "Credit or debit card",
    description:
      "Choose card as your preferred payment method. No card details are collected here.",
  },
  {
    value: "payment_link",
    label: "Payment link",
    description: "Request a payment link after your order is placed.",
  },
  {
    value: "bank_transfer",
    label: "Bank transfer",
    description: "Request bank transfer instructions after placing your order.",
  },
  {
    value: "wallet",
    label: "Digital wallet",
    description: "Choose a digital wallet as your preferred payment method.",
  },
  { value: "cod", label: "Cash on delivery", description: "Pay when your order arrives." },
];

function CheckoutPage() {
  const money = useCurrencyFormatter({ locale: "en-US" });
  const navigate = useNavigate();
  const getCart = useServerFn(myGetCart);
  const listAddresses = useServerFn(myListAddresses);
  const saveAddress = useServerFn(mySaveAddress);
  const listShipping = useServerFn(myListShipping);
  const selectShipping = useServerFn(mySelectShipping);
  const applyTax = useServerFn(myApplyTax);
  const placeOrder = useServerFn(myPlaceOrder);
  const applyPromo = useServerFn(myApplyPromoCode);
  const removePromo = useServerFn(myRemovePromoCode);

  const cartQ = useQuery({ queryKey: ["client-cart"], queryFn: () => getCart() });
  const addressQ = useQuery({ queryKey: ["client-addresses"], queryFn: () => listAddresses() });
  const [shippingAddress, setShippingAddress] = useState<Address>({
    street1: "",
    city: "",
    postal_code: "",
    country: "US",
  });
  const [selectedAddressId, setSelectedAddressId] = useState<string>("new");
  const [shippingRateId, setShippingRateId] = useState("");
  const [payment, setPayment] = useState<PaymentMethod>("card");
  const [notes, setNotes] = useState("");
  const [promoInput, setPromoInput] = useState("");
  const [step, setStep] = useState<CheckoutStep>(0);
  const [placing, setPlacing] = useState(false);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousStepRef = useRef<CheckoutStep>(0);

  const cart = cartQ.data?.cart as
    | {
        id: string;
        currency: string;
        subtotal: number;
        discount: number;
        shipping: number;
        tax: number;
        total: number;
        promo_code?: string | null;
        applied_promotions?: Array<{
          promotion_id: string;
          name: string;
          code: string | null;
          amount_off_cents: number;
          free_shipping: boolean;
        }>;
      }
    | undefined;
  const savedAddresses = (addressQ.data as SavedAddress[] | undefined) ?? EMPTY_SAVED_ADDRESSES;
  const activeAddress =
    selectedAddressId === "new"
      ? shippingAddress
      : (savedAddresses.find((address) => address.id === selectedAddressId) ?? shippingAddress);

  const shippingQ = useQuery({
    queryKey: ["client-shipping", activeAddress.country],
    queryFn: () => listShipping({ data: { country: activeAddress.country } }),
    enabled: Boolean(activeAddress.country),
  });
  const rates =
    (shippingQ.data as
      | Array<{
          id: string;
          name: string;
          price: number;
          estimated_days_min: number | null;
          estimated_days_max: number | null;
        }>
      | undefined) ?? [];
  const selectedRate = rates.find((rate) => rate.id === shippingRateId);
  const selectedPayment = PAYMENT_METHODS.find((method) => method.value === payment)!;

  const applyPromoM = useMutation({
    mutationFn: (code: string) => applyPromo({ data: { cartId: cart!.id, code } }),
    onSuccess: () => {
      setPromoInput("");
      void cartQ.refetch();
      toast.success("Promo code applied");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const removePromoM = useMutation({
    mutationFn: () => removePromo({ data: { cartId: cart!.id } }),
    onSuccess: () => void cartQ.refetch(),
    onError: (error: Error) => toast.error(error.message),
  });

  useEffect(() => {
    setShippingRateId("");
  }, [activeAddress.country, selectedAddressId]);

  useEffect(() => {
    if (previousStepRef.current === step) return;
    previousStepRef.current = step;
    if (window.matchMedia("(max-width: 1023px)").matches) {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      stepHeadingRef.current?.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });
    }
  }, [step]);

  const addressError = !activeAddress.street1.trim()
    ? "Enter a street address to continue."
    : !activeAddress.city.trim()
      ? "Enter a city to continue."
      : !activeAddress.postal_code.trim()
        ? "Enter a postal code to continue."
        : !/^[A-Za-z]{2}$/.test(activeAddress.country.trim())
          ? "Enter a valid two-letter country code."
          : null;

  async function continueToPayment() {
    if (addressError) {
      toast.error(addressError);
      return;
    }
    if (shippingQ.isLoading) return;
    if (rates.length > 0 && !selectedRate) {
      toast.error("Choose a delivery option to continue.");
      return;
    }
    if (!cart) return;
    setPlacing(true);
    try {
      await applyTax({
        data: {
          cartId: cart.id,
          country: activeAddress.country.trim().toUpperCase(),
          region: activeAddress.region?.trim() || undefined,
        },
      });
      if (selectedRate) {
        await selectShipping({ data: { cartId: cart.id, rateId: selectedRate.id } });
      }
      await cartQ.refetch();
      setStep(1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update your order totals.");
    } finally {
      setPlacing(false);
    }
  }

  async function submitOrder() {
    if (!cart || placing) return;
    if (addressError) {
      setStep(0);
      toast.error(addressError);
      return;
    }
    if (rates.length > 0 && !selectedRate) {
      setStep(0);
      toast.error("Choose a delivery option before placing your order.");
      return;
    }

    setPlacing(true);
    try {
      if (selectedAddressId === "new") {
        await saveAddress({
          data: {
            addressType: "shipping",
            ...activeAddress,
            country: activeAddress.country.trim().toUpperCase(),
          },
        });
      }
      await applyTax({
        data: {
          cartId: cart.id,
          country: activeAddress.country.trim().toUpperCase(),
          region: activeAddress.region?.trim() || undefined,
        },
      });
      if (selectedRate) {
        await selectShipping({ data: { cartId: cart.id, rateId: selectedRate.id } });
      }

      const result = await placeOrder({
        data: {
          cartId: cart.id,
          shippingAddress: {
            ...activeAddress,
            country: activeAddress.country.trim().toUpperCase(),
          },
          paymentMethod: payment,
          notes: notes.trim() || undefined,
        },
      });
      toast.success(`Order ${result.orderNumber} placed`);
      navigate({ to: "/client/order-confirmation/$id", params: { id: result.orderId } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "We could not place your order.");
    } finally {
      setPlacing(false);
    }
  }

  if (cartQ.isLoading) {
    return (
      <div className="flex min-h-60 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading your checkout
      </div>
    );
  }
  if (cartQ.isError) {
    return (
      <div className="mx-auto max-w-xl rounded-control border border-destructive/30 bg-destructive/5 p-6 text-center">
        <h2 className="font-semibold">Checkout isn’t available right now</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your cart couldn’t be loaded. Please try again.
        </p>
        <Button className="mt-4" variant="outline" onClick={() => void cartQ.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (!cart) return null;

  const itemCount =
    cartQ.data?.items?.reduce(
      (count: number, item: { quantity: number }) => count + item.quantity,
      0,
    ) ?? 0;
  const promotions = cart.applied_promotions ?? [];
  const cartItems = (cartQ.data?.items ?? []) as Array<{
    id: string;
    name: string;
    quantity: number;
    total: number;
  }>;
  const applyPromoCode = () => {
    const code = promoInput.trim();
    if (code) applyPromoM.mutate(code);
  };

  if (cartItems.length === 0) {
    return (
      <div className="mx-auto max-w-xl rounded-control border border-border bg-surface p-8 text-center shadow-sm">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
          <PackageCheck className="h-6 w-6" />
        </span>
        <h1 className="mt-4 font-display text-2xl font-semibold">Your cart is empty</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Add an item to your cart before starting checkout.
        </p>
        <Button asChild className="mt-5">
          <Link to="/client">Return to customer portal</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-28 lg:pb-8">
      <header className="space-y-2">
        <Link
          to="/client/cart"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to cart
        </Link>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            Secure checkout
          </p>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Complete your order
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your cart is reserved while you complete these steps.
          </p>
        </div>
      </header>

      <nav aria-label="Checkout progress">
        <ol className="grid grid-cols-3">
          {STEPS.map((label, index) => {
            const done = step > index;
            const current = step === index;
            return (
              <li key={label} className="relative">
                {index < STEPS.length - 1 && (
                  <span
                    aria-hidden="true"
                    className={`absolute left-[calc(50%+1.25rem)] right-0 top-4 h-px ${
                      done ? "bg-primary" : "bg-border"
                    }`}
                  />
                )}
                <button
                  type="button"
                  aria-current={current ? "step" : undefined}
                  disabled={index > step || placing}
                  onClick={() => index < step && setStep(index as CheckoutStep)}
                  className="relative flex w-full flex-col items-center gap-2 text-center disabled:cursor-default"
                >
                  <span
                    className={`grid h-8 w-8 place-items-center rounded-full border text-xs font-semibold transition-colors ${
                      done
                        ? "border-primary bg-primary text-primary-foreground"
                        : current
                          ? "border-primary bg-background text-primary ring-4 ring-primary/10"
                          : "border-border bg-background text-muted-foreground"
                    }`}
                  >
                    {done ? <Check className="h-4 w-4" /> : index + 1}
                  </span>
                  <span
                    className={`text-xs font-medium sm:text-sm ${
                      current || done ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {label}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <section
            aria-labelledby="checkout-step-heading"
            className="rounded-control border border-border bg-surface p-4 shadow-sm sm:p-6"
          >
            <div className="mb-5 flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-control bg-primary/10 text-primary">
                {step === 0 ? (
                  <MapPin className="h-5 w-5" />
                ) : step === 1 ? (
                  <CreditCard className="h-5 w-5" />
                ) : (
                  <PackageCheck className="h-5 w-5" />
                )}
              </span>
              <div>
                <h2
                  id="checkout-step-heading"
                  ref={stepHeadingRef}
                  className="scroll-mt-4 text-lg font-semibold"
                >
                  {step === 0
                    ? "Delivery details"
                    : step === 1
                      ? "Payment method"
                      : "Review your order"}
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {step === 0
                    ? "Where should we send your order?"
                    : step === 1
                      ? "Choose how you’d like to pay."
                      : "Everything look right? Your total is confirmed before placing."}
                </p>
              </div>
            </div>

            {step === 0 && (
              <div
                key={step}
                className="animate-in fade-in slide-in-from-bottom-1 duration-200 motion-reduce:animate-none"
              >
                {addressQ.isError ? (
                  <div role="alert" className="rounded-control border border-destructive/30 p-3 text-sm">
                    Saved addresses could not be loaded. You can still enter a new address.
                  </div>
                ) : null}
                {savedAddresses.length > 0 && (
                  <RadioGroup
                    value={selectedAddressId}
                    onValueChange={setSelectedAddressId}
                    aria-label="Choose a shipping address"
                    className="grid gap-2 sm:grid-cols-2"
                  >
                    {savedAddresses.map((address) => (
                      <label
                        key={address.id}
                        className={`flex cursor-pointer gap-3 rounded-control border p-3 transition-colors ${
                          selectedAddressId === address.id
                            ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                            : "border-border hover:bg-muted/40"
                        }`}
                      >
                        <RadioGroupItem value={address.id} className="mt-0.5" />
                        <span className="min-w-0 text-sm">
                          <span className="block font-medium">
                            {address.label ?? "Saved address"}
                          </span>
                          <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                            {address.street1}, {address.city}
                            {address.region ? `, ${address.region}` : ""} {address.postal_code},{" "}
                            {address.country}
                          </span>
                        </span>
                      </label>
                    ))}
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-control border p-3 text-sm transition-colors ${
                        selectedAddressId === "new"
                          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                          : "border-border hover:bg-muted/40"
                      }`}
                    >
                      <RadioGroupItem value="new" />
                      <span className="font-medium">Use a new address</span>
                    </label>
                  </RadioGroup>
                )}

                {selectedAddressId === "new" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="checkout-street">Street address</Label>
                      <Input
                        id="checkout-street"
                        autoComplete="address-line1"
                        value={shippingAddress.street1}
                        onChange={(event) =>
                          setShippingAddress({ ...shippingAddress, street1: event.target.value })
                        }
                        placeholder="House number and street"
                        required
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="checkout-street2">Apartment, suite, etc. (optional)</Label>
                      <Input
                        id="checkout-street2"
                        autoComplete="address-line2"
                        value={shippingAddress.street2 ?? ""}
                        onChange={(event) =>
                          setShippingAddress({ ...shippingAddress, street2: event.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="checkout-city">City</Label>
                      <Input
                        id="checkout-city"
                        autoComplete="address-level2"
                        value={shippingAddress.city}
                        onChange={(event) =>
                          setShippingAddress({ ...shippingAddress, city: event.target.value })
                        }
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="checkout-region">State / region (optional)</Label>
                      <Input
                        id="checkout-region"
                        autoComplete="address-level1"
                        value={shippingAddress.region ?? ""}
                        onChange={(event) =>
                          setShippingAddress({ ...shippingAddress, region: event.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="checkout-postal">Postal code</Label>
                      <Input
                        id="checkout-postal"
                        autoComplete="postal-code"
                        value={shippingAddress.postal_code}
                        onChange={(event) =>
                          setShippingAddress({
                            ...shippingAddress,
                            postal_code: event.target.value,
                          })
                        }
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="checkout-country">Country code</Label>
                      <Input
                        id="checkout-country"
                        autoComplete="country"
                        value={shippingAddress.country}
                        onChange={(event) =>
                          setShippingAddress({
                            ...shippingAddress,
                            country: event.target.value.toUpperCase(),
                          })
                        }
                        maxLength={2}
                        placeholder="US"
                        required
                      />
                    </div>
                  </div>
                )}

                <div className="border-t border-border pt-5">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-muted-foreground" />
                    <h3 className="font-semibold">Delivery option</h3>
                  </div>
                  {shippingQ.isLoading ? (
                    <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Checking delivery options
                    </div>
                  ) : shippingQ.isError ? (
                    <div
                      role="alert"
                      className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-control border border-destructive/30 p-3"
                    >
                      <p className="text-sm text-destructive">
                        Delivery options could not be loaded.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void shippingQ.refetch()}
                      >
                        Try again
                      </Button>
                    </div>
                  ) : rates.length === 0 ? (
                    <p className="mt-3 rounded-control bg-muted/40 p-3 text-sm text-muted-foreground">
                      No delivery rates are listed for this destination. You can continue and we’ll
                      confirm delivery with your order.
                    </p>
                  ) : (
                    <RadioGroup
                      value={shippingRateId}
                      onValueChange={setShippingRateId}
                      aria-label="Choose a delivery option"
                      className="mt-3 space-y-2"
                    >
                      {rates.map((rate) => (
                        <label
                          key={rate.id}
                          className={`flex cursor-pointer items-center justify-between gap-3 rounded-control border p-3 transition-colors ${
                            shippingRateId === rate.id
                              ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                              : "border-border hover:bg-muted/40"
                          }`}
                        >
                          <span className="flex min-w-0 items-start gap-3">
                            <RadioGroupItem value={rate.id} className="mt-0.5" />
                            <span className="text-sm">
                              <span className="block font-medium">{rate.name}</span>
                              {(rate.estimated_days_min || rate.estimated_days_max) && (
                                <span className="mt-0.5 block text-xs text-muted-foreground">
                                  {rate.estimated_days_min ?? "?"}–{rate.estimated_days_max ?? "?"}{" "}
                                  business days
                                </span>
                              )}
                            </span>
                          </span>
                          <span className="shrink-0 text-sm font-semibold">
                            {money(rate.price, cart.currency)}
                          </span>
                        </label>
                      ))}
                    </RadioGroup>
                  )}
                </div>
              </div>
            )}

            {step === 1 && (
              <div
                key={step}
                className="animate-in fade-in slide-in-from-bottom-1 duration-200 motion-reduce:animate-none"
              >
                <p className="mb-4 rounded-control bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                  Payment is not collected on this screen. Your selected method is added to the
                  order, and payment is completed separately.
                </p>
                <RadioGroup
                  value={payment}
                  onValueChange={(value) => setPayment(value as PaymentMethod)}
                  aria-label="Choose a payment method"
                  className="space-y-2"
                >
                  {PAYMENT_METHODS.map((method) => (
                    <label
                      key={method.value}
                      className={`flex cursor-pointer gap-3 rounded-control border p-4 transition-colors ${
                        payment === method.value
                          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                          : "border-border hover:bg-muted/40"
                      }`}
                    >
                      <RadioGroupItem value={method.value} className="mt-0.5" />
                      <span>
                        <span className="block text-sm font-medium">{method.label}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {method.description}
                        </span>
                      </span>
                    </label>
                  ))}
                </RadioGroup>
                <div className="space-y-1.5 border-t border-border pt-5">
                  <Label htmlFor="checkout-notes">Delivery instructions (optional)</Label>
                  <Textarea
                    id="checkout-notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Gate code, preferred drop-off location"
                    rows={3}
                    maxLength={2000}
                  />
                  <p className="text-right text-xs text-muted-foreground">{notes.length}/2000</p>
                </div>
              </div>
            )}

            {step === 2 && (
              <div
                key={step}
                className="space-y-4 animate-in fade-in slide-in-from-bottom-1 duration-200 motion-reduce:animate-none"
              >
                <div className="rounded-control border border-border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold">Delivering to</h3>
                    <Button variant="ghost" size="sm" onClick={() => setStep(0)}>
                      Edit
                    </Button>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {activeAddress.street1}
                    {activeAddress.street2 ? `, ${activeAddress.street2}` : ""}
                    <br />
                    {activeAddress.city}
                    {activeAddress.region ? `, ${activeAddress.region}` : ""}{" "}
                    {activeAddress.postal_code}, {activeAddress.country}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {selectedRate?.name ?? "Delivery details confirmed with your order"}
                  </p>
                </div>
                <div className="rounded-control border border-border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold">Payment</h3>
                    <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                      Edit
                    </Button>
                  </div>
                  <p className="mt-2 text-sm">{selectedPayment.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {selectedPayment.description}
                  </p>
                </div>
                {notes.trim() && (
                  <div className="rounded-control border border-border p-4">
                    <h3 className="font-semibold">Delivery instructions</h3>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                      {notes}
                    </p>
                  </div>
                )}
                <p className="flex items-start gap-2 rounded-control bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                  <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
                  Your order details are reviewed before submission. Payment instructions depend on
                  the method selected.
                </p>
              </div>
            )}

            <div className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-4">
              {step > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={placing}
                  onClick={() => setStep((current) => (current - 1) as CheckoutStep)}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">Step 1 of 3</span>
              )}
              {step === 0 ? (
                <Button
                  type="button"
                  disabled={placing || shippingQ.isLoading || shippingQ.isError}
                  onClick={() => void continueToPayment()}
                  className="hidden lg:inline-flex"
                >
                  {placing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Continue to payment
                  {!placing && <ArrowRight className="ml-2 h-4 w-4" />}
                </Button>
              ) : step === 1 ? (
                <Button
                  type="button"
                  disabled={placing}
                  onClick={() => setStep(2)}
                  className="hidden lg:inline-flex"
                >
                  Review order
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={placing}
                  onClick={() => void submitOrder()}
                  className="hidden lg:inline-flex"
                >
                  {placing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Placing order
                    </>
                  ) : (
                    <>
                      Place order
                      <CheckCircle2 className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              )}
            </div>
          </section>
        </div>

        <aside className="rounded-control border border-border bg-surface p-4 shadow-sm sm:p-5 lg:sticky lg:top-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Order summary</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {itemCount} {itemCount === 1 ? "item" : "items"}
              </p>
            </div>
            <Link
              to="/client/cart"
              className="text-xs font-medium text-primary underline-offset-4 hover:underline"
            >
              Edit cart
            </Link>
          </div>

          {cartItems.length > 0 && (
            <ul className="mt-4 max-h-44 space-y-3 overflow-y-auto border-b border-border pb-4">
              {cartItems.map((item) => (
                <li key={item.id} className="flex justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{item.name}</span>
                    <span className="text-xs text-muted-foreground">Qty {item.quantity}</span>
                  </span>
                  <span className="shrink-0">{money(item.total, cart.currency)}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{money(cart.subtotal, cart.currency)}</span>
            </div>
            {cart.discount > 0 && (
              <div className="flex justify-between gap-3 text-emerald-700 dark:text-emerald-400">
                <span>Discount</span>
                <span>−{money(cart.discount, cart.currency)}</span>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Shipping</span>
              <span>
                {cart.shipping > 0
                  ? money(cart.shipping, cart.currency)
                  : selectedRate
                    ? "Free"
                    : rates.length > 0
                      ? "Select delivery option"
                      : "To be confirmed"}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Estimated tax</span>
              <span>{money(cart.tax, cart.currency)}</span>
            </div>
          </div>

          <div className="mt-4 flex items-end justify-between gap-3 border-t border-border pt-4">
            <span className="font-semibold">Total</span>
            <span className="text-xl font-semibold tracking-tight">
              {money(cart.total, cart.currency)}
            </span>
          </div>
          {cartQ.isFetching && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Updating totals
            </p>
          )}

          <div className="mt-5 space-y-2 border-t border-border pt-4">
            <Label htmlFor="checkout-promo" className="flex items-center gap-2 text-sm">
              <Tag className="h-4 w-4" />
              Promo code
            </Label>
            {promotions.length > 0 ? (
              <div className="space-y-2">
                {promotions.map((promo) => (
                  <div
                    key={promo.promotion_id}
                    className="flex items-center justify-between gap-2 rounded-control bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                  >
                    <span className="min-w-0 truncate">
                      <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
                      {promo.name}
                    </span>
                    <span className="shrink-0 font-semibold">
                      {promo.free_shipping
                        ? "Free shipping"
                        : `−${money(promo.amount_off_cents / 100, cart.currency)}`}
                    </span>
                    {promo.code && (
                      <button
                        type="button"
                        onClick={() => removePromoM.mutate()}
                        disabled={removePromoM.isPending}
                        aria-label={`Remove promo code ${promo.code}`}
                        className="rounded p-1 text-emerald-800/70 hover:bg-emerald-900/10 hover:text-emerald-900 disabled:opacity-50 dark:text-emerald-300"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  applyPromoCode();
                }}
              >
                <Input
                  id="checkout-promo"
                  value={promoInput}
                  onChange={(event) => setPromoInput(event.target.value.toUpperCase())}
                  placeholder="Enter code"
                  autoComplete="off"
                  className="h-10"
                  disabled={placing || applyPromoM.isPending}
                />
                <Button
                  type="submit"
                  variant="outline"
                  disabled={placing || !promoInput.trim() || applyPromoM.isPending}
                >
                  {applyPromoM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
                </Button>
              </form>
            )}
          </div>

          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            By placing your order, you agree to the terms of service and privacy policy.
          </p>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Order total</p>
            <p className="text-lg font-semibold">{money(cart.total, cart.currency)}</p>
          </div>
          {step === 0 ? (
            <Button
              type="button"
              disabled={placing || shippingQ.isLoading || shippingQ.isError}
              onClick={() => void continueToPayment()}
            >
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : step === 1 ? (
            <Button type="button" onClick={() => setStep(2)}>
              Review order
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" disabled={placing} onClick={() => void submitOrder()}>
              {placing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              {placing ? "Placing order" : "Place order"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
