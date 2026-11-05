import type { Certificate } from '../types';
import preservedData from './authoritativePreservedCertificates.json';

export const AUTHORITATIVE_PRESERVED_CERTIFICATES: Certificate[] = preservedData as Certificate[];
