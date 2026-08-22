import { Metadata } from 'next';
import QRStoreClient from './QRStoreClient';

export const metadata: Metadata = {
  title: 'QR Tienda Online - ContFast Enterprise',
  description: 'Genera, personaliza e imprime el código QR de tu tienda online.',
};

export const dynamic = 'force-dynamic';

export default function QRStorePage() {
  return <QRStoreClient />;
}
