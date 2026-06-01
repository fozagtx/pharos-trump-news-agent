import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { useCurrentAccount, useDAppKit } from '@mysten/dapp-kit-react';
import { Transaction } from '@mysten/sui/transactions';
import {
  ArrowPathIcon,
  ArrowUpRightIcon,
  CheckCircleIcon,
  CircleStackIcon,
  ClipboardDocumentIcon,
  CloudArrowUpIcon,
  CommandLineIcon,
  CpuChipIcon,
  CubeIcon,
  ExclamationCircleIcon,
  HomeIcon,
  LockClosedIcon,
  ServerIcon,
  ShieldCheckIcon,
  UserCircleIcon,
  WalletIcon,
} from '@heroicons/react/24/outline';
import { type ComponentType, type CSSProperties, FormEvent, type SVGProps, useEffect, useMemo, useState } from 'react';
import { apiUrl, fetchHealth, fetchProducts, launchProduct, verifyPurchase } from './api';
import { defaultConfig } from './shared/config';
import { formatMistAsSui, parseSuiToMist, shortenAddress } from './shared/money';
import type { HealthResponse, ProductPublic } from './shared/types';

type Notice = {
  kind: 'success' | 'error' | 'info';
  text: string;
};

type DashboardView = 'home' | 'launch' | 'products' | 'agents' | 'profile';
type HeroIcon = ComponentType<SVGProps<SVGSVGElement>>;

const dashboardViews: { id: DashboardView; label: string; title: string; icon: HeroIcon }[] = [
  { id: 'home', label: 'Home', title: 'Walaxy dashboard', icon: HomeIcon },
  { id: 'launch', label: 'Launch', title: 'Launch product', icon: CloudArrowUpIcon },
  { id: 'products', label: 'Products', title: 'Live catalog', icon: CubeIcon },
  { id: 'agents', label: 'Agents', title: 'Agent checkout', icon: CpuChipIcon },
  { id: 'profile', label: 'Profile', title: 'Account profile', icon: UserCircleIcon },
];

const heroWorkflowSteps: { label: string; detail: string; icon: HeroIcon }[] = [
  { label: 'Upload', detail: 'Product file', icon: CloudArrowUpIcon },
  { label: 'Encrypt', detail: 'Private bytes', icon: LockClosedIcon },
  { label: 'Store', detail: 'Walrus blob', icon: CircleStackIcon },
  { label: 'Record', detail: 'Sui object', icon: ShieldCheckIcon },
  { label: 'Serve', detail: 'Agent 402', icon: CpuChipIcon },
];

const initialNotice: Notice = {
  kind: 'info',
  text: 'Catalog starts empty. Launching requires a real file and a live Walrus Testnet upload.',
};

function IconGlyph({ icon: Icon, size, className }: { icon: HeroIcon; size: number; className?: string }) {
  return <Icon aria-hidden="true" className={className} style={{ width: size, height: size }} />;
}

export default function App() {
  const currentAccount = useCurrentAccount();

  useEffect(() => {
    if (window.location.pathname !== '/') {
      window.history.replaceState(null, '', '/');
    }
  }, []);

  return currentAccount ? <ProductApp /> : <LandingPage />;
}

function LandingLaunchAppButton({ className, iconSize }: { className: string; iconSize: number }) {
  return (
    <ConnectButton className={className}>
      <span>Launch App</span>
      <IconGlyph icon={ArrowUpRightIcon} size={iconSize} />
    </ConnectButton>
  );
}

function LandingPage() {
  const catalogUrl = defaultConfig.publicCatalogUrl;

  return (
    <main className="landing-page">
      <header className="site-header">
        <nav className="landing-nav" aria-label="Primary">
          <a className="landing-brand" href="/">
            <img className="brand-icon" src="/walaxy-mark.svg" alt="" aria-hidden="true" />
            Walaxy
          </a>
          <div className="landing-links">
            <LandingLaunchAppButton className="nav-action" iconSize={17} />
          </div>
        </nav>
      </header>

      <section className="landing-hero">
        <div className="hero-layout">
          <div className="hero-copy">
            <h1>
              <span>Agent</span>
              <span>Commerce</span>
              <span>For Digital</span>
              <span>Products</span>
            </h1>
            <p>
              A testnet launch surface for entrepreneurs selling real digital products to humans
              and agents. Files go to Walrus, settlement is verified on Sui, and agent access runs
              through an HTTP 402 payment route.
            </p>
          </div>
          <div className="hero-visual">
            <div className="workflow-demo">
              <div className="workflow-window">
                <div className="workflow-window-bar">
                  <span />
                  <span />
                  <span />
                  <strong>Walaxy launch path</strong>
                  <a className="workflow-catalog-link" href={catalogUrl} target="_blank" rel="noreferrer">
                    {catalogUrl}
                  </a>
                </div>
                <div className="workflow-track">
                  <span className="workflow-line" />
                  <span className="workflow-pulse" />
                  {heroWorkflowSteps.map((step, index) => (
                    <div className="workflow-step" style={{ '--step-index': index } as CSSProperties} key={step.label}>
                      <span className="workflow-icon">
                        <IconGlyph icon={step.icon} size={24} />
                      </span>
                      <div>
                        <strong>{step.label}</strong>
                        <span>{step.detail}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="workflow-footer">
                <span>Wallet buyer</span>
                <span>Agent buyer</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function ProductApp() {
  const dAppKit = useDAppKit();
  const currentAccount = useCurrentAccount();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [products, setProducts] = useState<ProductPublic[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [buyingProductId, setBuyingProductId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(initialNotice);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priceSui, setPriceSui] = useState('');
  const [sellerAddress, setSellerAddress] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<DashboardView>('home');

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId) ?? products[0] ?? null,
    [products, selectedProductId],
  );

  useEffect(() => {
    if (!currentAccount) return;
    refreshAll().catch((error: unknown) => {
      setNotice({ kind: 'error', text: errorMessage(error) });
    });
  }, [currentAccount?.address]);

  useEffect(() => {
    if (currentAccount?.address && !sellerAddress) {
      setSellerAddress(currentAccount.address);
    }
  }, [currentAccount?.address, sellerAddress]);

  async function refreshAll() {
    setLoading(true);
    try {
      const [nextHealth, nextProducts] = await Promise.all([fetchHealth(), fetchProducts()]);
      setHealth(nextHealth);
      setProducts(nextProducts);
      if (nextProducts.length && !selectedProductId) setSelectedProductId(nextProducts[0].id);
    } finally {
      setLoading(false);
    }
  }

  async function handleLaunch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError(null);

    if (!currentAccount) {
      setFieldError('Connect a Sui Testnet wallet before launching.');
      return;
    }

    if (!file) {
      setFieldError('Choose the digital product file to encrypt and store.');
      return;
    }

    let priceMist: string;
    try {
      priceMist = parseSuiToMist(priceSui);
    } catch (error) {
      setFieldError(errorMessage(error));
      return;
    }

    const body = new FormData();
    body.set('title', title);
    body.set('description', description);
    body.set('priceMist', priceMist);
    body.set('sellerAddress', sellerAddress || currentAccount.address);
    body.set('file', file);

    setLaunching(true);
    setNotice({ kind: 'info', text: 'Encrypting file and publishing encrypted bytes to Walrus Testnet.' });

    try {
      const response = await launchProduct(body);
      setTitle('');
      setDescription('');
      setPriceSui('');
      setFile(null);
      setProducts((current) => [response.product, ...current]);
      setSelectedProductId(response.product.id);
      setNotice({ kind: 'success', text: `Published ${response.product.title} to Walrus Testnet.` });
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error) });
    } finally {
      setLaunching(false);
    }
  }

  async function handleBuy(product: ProductPublic) {
    if (!currentAccount) {
      setNotice({ kind: 'error', text: 'Connect a Sui Testnet wallet before buying.' });
      return;
    }

    if (!health?.contract.ok || !health.contract.packageId) {
      setNotice({ kind: 'error', text: 'Sui marketplace contract is not configured.' });
      return;
    }

    setBuyingProductId(product.id);
    setNotice({ kind: 'info', text: 'Wallet signature requested. The marketplace contract routes SUI to the seller.' });

    try {
      const tx = new Transaction();
      const [payment] = tx.splitCoins(tx.gas, [BigInt(product.priceMist)]);
      tx.moveCall({
        target: `${health.contract.packageId}::marketplace::purchase`,
        arguments: [tx.object(product.id), payment, tx.object.clock()],
      });
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });

      if (result.FailedTransaction) {
        throw new Error(result.FailedTransaction.status.error?.message || 'Sui transaction failed.');
      }

      const digest = result.Transaction.digest;
      const response = await verifyPurchase(product.id, digest, currentAccount.address);
      setNotice({
        kind: 'success',
        text: `Payment verified on Sui Testnet. Seal receipt ${shortenAddress(response.receipt.receiptId || digest)} issued.`,
      });
      await refreshAll();
    } catch (error) {
      setNotice({ kind: 'error', text: errorMessage(error) });
    } finally {
      setBuyingProductId(null);
    }
  }

  function agentEndpoint(product: ProductPublic | null) {
    return product ? apiUrl(product.agentBuyUrl || `/x402/products/${product.id}/asset`) : '';
  }

  const activeViewTitle = dashboardViews.find((view) => view.id === activeView)?.title ?? 'Walaxy dashboard';

  if (!currentAccount) {
    return <LandingPage />;
  }

  return (
    <main className="wallet-dashboard-shell">
      <section className="wallet-dashboard-frame">
        <aside className="wallet-sidebar" aria-label="Dashboard navigation">
          <div className="sidebar-mark">
            <img src="/walaxy-mark.svg" alt="" aria-hidden="true" />
          </div>

          <nav className="sidebar-nav">
            {dashboardViews.map((view) => {
              return (
                <button
                  className={`sidebar-nav-item ${activeView === view.id ? 'active' : ''}`}
                  key={view.id}
                  type="button"
                  onClick={() => setActiveView(view.id)}
                >
                  <IconGlyph icon={view.icon} size={27} />
                  <span>{view.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="wallet-sidebar-footer">
            <span className="sidebar-token">
              <IconGlyph icon={WalletIcon} size={20} />
            </span>
            <button
              className="sidebar-account"
              type="button"
              onClick={() => {
                void dAppKit.disconnectWallet();
              }}
            >
              {shortenAddress(currentAccount.address)}
            </button>
          </div>
        </aside>

        <section className="wallet-main-panel">
          <header className="dashboard-panel-header">
            <h1>{activeViewTitle}</h1>
            <button
              className="wallet-button"
              type="button"
              onClick={() => {
                void dAppKit.disconnectWallet();
              }}
            >
              Disconnect
            </button>
          </header>

          <section className={`notice notice-${notice.kind}`} role="status">
            <IconGlyph icon={notice.kind === 'success' ? CheckCircleIcon : ExclamationCircleIcon} size={18} />
            <span>{notice.text}</span>
          </section>

          {activeView === 'home' && (
            <section className="dashboard-home">
              <div className="status-grid">
                <ProtocolLine label="Products" value={String(products.length)} />
                <ProtocolLine label="Contract" value={health?.contract.ok ? 'Ready' : 'Not ready'} />
                <ProtocolLine label="Storage" value={health ? 'Walrus configured' : 'Checking'} />
                <ProtocolLine label="Selected" value={selectedProduct ? selectedProduct.title : 'No product selected'} />
              </div>
              <div className="empty-state compact">
                <IconGlyph icon={CircleStackIcon} size={30} />
                <h2>{products.length ? `${products.length} product${products.length === 1 ? '' : 's'} live` : 'No products yet'}</h2>
                <p>Use Launch to publish a real encrypted product, then Products and Agents will render live routes.</p>
              </div>
            </section>
          )}

          {activeView === 'launch' && (
            <form className="panel launch-panel" onSubmit={handleLaunch}>
              <PanelTitle icon={<IconGlyph icon={CloudArrowUpIcon} size={19} />} title="Launch Product" />
              <div className="field-grid">
                <label>
                  <span>Product title</span>
                  <input value={title} onChange={(event) => setTitle(event.target.value)} required minLength={2} />
                </label>
                <label>
                  <span>Price in SUI</span>
                  <input
                    value={priceSui}
                    onChange={(event) => setPriceSui(event.target.value)}
                    inputMode="decimal"
                    required
                  />
                </label>
              </div>
              <label>
                <span>Seller address</span>
                <input
                  value={sellerAddress}
                  onChange={(event) => setSellerAddress(event.target.value)}
                  required
                />
              </label>
              <label>
                <span>Description</span>
                <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} />
              </label>
              <label className="file-drop">
                <IconGlyph icon={LockClosedIcon} size={24} />
                <strong>{file ? file.name : 'Choose encrypted product source'}</strong>
                <span>{file ? `${formatBytes(file.size)} before encryption` : 'PDF, code bundle, dataset, or any binary file'}</span>
                <input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
              </label>
              {fieldError && <p className="inline-error">{fieldError}</p>}
              <button className="primary-button" type="submit" disabled={launching || !currentAccount}>
                <IconGlyph icon={launching ? ArrowPathIcon : ShieldCheckIcon} size={18} className={launching ? 'spin' : undefined} />
                {currentAccount ? 'Encrypt and publish to Walrus' : 'Connect wallet to launch'}
              </button>
            </form>
          )}

          {activeView === 'products' && (
            <section className="panel catalog-panel">
              <div className="panel-row">
                <PanelTitle icon={<IconGlyph icon={CircleStackIcon} size={19} />} title="Live Catalog" />
                <button className="icon-button" type="button" onClick={refreshAll} aria-label="Refresh catalog">
                  <IconGlyph icon={ArrowPathIcon} size={17} />
                </button>
              </div>

              {loading ? (
                <div className="empty-state">
                  <IconGlyph icon={ArrowPathIcon} size={28} className="spin" />
                  <p>Reading Sui marketplace state and Testnet health.</p>
                </div>
              ) : products.length === 0 ? (
                <div className="empty-state">
                  <IconGlyph icon={LockClosedIcon} size={32} />
                  <h2>No products yet</h2>
                  <p>Products appear here only after a real Walrus Testnet upload returns certified blob IDs.</p>
                </div>
              ) : (
                <div className="product-list">
                  {products.map((product) => (
                    <article
                      className={`product-row ${selectedProduct?.id === product.id ? 'selected' : ''}`}
                      key={product.id}
                    >
                      <button type="button" className="product-main" onClick={() => setSelectedProductId(product.id)}>
                        <span className="product-title">{product.title}</span>
                        <span className="product-meta">
                          {formatMistAsSui(product.priceMist)} SUI · {formatBytes(product.fileSize)} ·{' '}
                          {product.purchaseCount} verified
                        </span>
                        <span className="hash-line">Walrus manifest {shortenAddress(product.manifestBlobId)}</span>
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={buyingProductId === product.id}
                        onClick={() => handleBuy(product)}
                      >
                        <IconGlyph icon={buyingProductId === product.id ? ArrowPathIcon : WalletIcon} size={17} className={buyingProductId === product.id ? 'spin' : undefined} />
                        Buy
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {activeView === 'agents' && (
            <section className="panel agent-panel">
              <PanelTitle icon={<IconGlyph icon={CommandLineIcon} size={19} />} title="Agent Checkout" />
              {selectedProduct ? (
                <>
                  <div className="endpoint-box">
                    <div>
                      <span>HTTP 402 endpoint</span>
                      <strong>{agentEndpoint(selectedProduct)}</strong>
                    </div>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label="Copy agent endpoint"
                      onClick={() => navigator.clipboard.writeText(agentEndpoint(selectedProduct))}
                    >
                      <IconGlyph icon={ClipboardDocumentIcon} size={17} />
                    </button>
                  </div>
                  <div className="protocol-grid">
                    <ProtocolLine label="Method" value="GET" />
                    <ProtocolLine label="Challenge" value="PAYMENT-REQUIRED" />
                    <ProtocolLine label="Retry header" value="PAYMENT-SIGNATURE" />
                    <ProtocolLine label="Settlement" value="Sui marketplace receipt" />
                    <ProtocolLine label="Amount" value={`${formatMistAsSui(selectedProduct.priceMist)} SUI`} />
                    <ProtocolLine label="Pay to" value={shortenAddress(selectedProduct.sellerAddress)} />
                  </div>
                  <code className="agent-command">
                    npm run agent:buy -- {agentEndpoint(selectedProduct)}
                  </code>
                </>
              ) : (
                <div className="empty-state compact">
                  <IconGlyph icon={ServerIcon} size={28} />
                  <p>Create a product to expose its paid agent download route.</p>
                </div>
              )}
            </section>
          )}

          {activeView === 'profile' && (
            <section className="dashboard-home">
              <div className="status-grid">
                <ProtocolLine label="Wallet" value={shortenAddress(currentAccount.address)} />
                <ProtocolLine label="Package" value={health?.contract.packageId ? shortenAddress(health.contract.packageId) : 'Not configured'} />
                <ProtocolLine label="Operator" value={health?.contract.operatorCapId ? shortenAddress(health.contract.operatorCapId) : 'Not configured'} />
                <ProtocolLine label="Agent x402" value={health?.nativeX402.ok ? 'Ready' : 'Not ready'} />
              </div>
            </section>
          )}
        </section>
      </section>
    </main>
  );
}

function PanelTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="panel-title">
      {icon}
      <h2>{title}</h2>
    </div>
  );
}

function ProtocolLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error.';
}
