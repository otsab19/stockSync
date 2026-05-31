import type { PortfolioActivityEvent, PortfolioApiResponse, PortfolioDataMeta, PortfolioPosition } from "@/types/portfolio"
import type { ClientPortfolioRepository, ClientPortfolioRequestOptions } from "@/lib/portfolio/repository"
import { createFailurePortfolioResponse, createSuccessPortfolioResponse } from "@/lib/dashboard/portfolio-response"
import type { BrokerApiCredentials, BrowserApiSyncResponse } from "@/types/integrations"

const DB_NAME = "stocksync-browser-db"
const DB_VERSION = 2
const STORE_NAME = "portfolio"
const BROKER_CONNECTION_STORE_NAME = "brokerConnections"
const DEFAULT_RECORD_KEY = "default"

const defaultPortfolio: PortfolioPosition[] = []
const defaultMetadata: PortfolioDataMeta = {
  sourceKind: "csv_import",
  lastSyncedAt: new Date().toISOString(),
  syncMode: "manual",
  brokerDetails: [],
}

type PortfolioRecord = {
  id: string
  positions: PortfolioPosition[]
  activity: PortfolioActivityEvent[]
  metadata?: PortfolioDataMeta | null
}

type BrokerImportMetadata = {
  broker: PortfolioPosition["broker"]
  sourceKind: PortfolioDataMeta["sourceKind"]
  fileName?: string
  lastSyncedAt?: string
  syncMode?: PortfolioDataMeta["syncMode"]
}

type BrokerRefreshSummary = {
  broker: PortfolioPosition["broker"]
  positionsImported: number
  message?: string
}

export type BrowserBrokerConnectionRecord = {
  id: PortfolioPosition["broker"]
  broker: PortfolioPosition["broker"]
  apiKey: string
  apiSecret?: string
  updatedAt: string
}

function ensureIndexedDbSupport() {
  if (typeof window === "undefined" || typeof window.indexedDB === "undefined") {
    throw new Error("IndexedDB is only available in a browser that supports it.")
  }
}

function isPortfolioPositionRecord(position: unknown): position is PortfolioPosition {
  return typeof position === "object"
    && position !== null
    && "id" in position
    && "companyName" in position
    && "brokerLabel" in position
    && "nativeCurrency" in position
    && "normalizedTotalValueGbp" in position
}

function createEmptyPortfolioRecord(): PortfolioRecord {
  return {
    id: DEFAULT_RECORD_KEY,
    positions: defaultPortfolio,
    activity: [],
    metadata: null,
  }
}

function isPortfolioActivityRecord(event: unknown): event is PortfolioActivityEvent {
  return typeof event === "object"
    && event !== null
    && "id" in event
    && "timestamp" in event
    && "broker" in event
    && "ticker" in event
    && "type" in event
}

function normalizeMetadata(metadata: PortfolioDataMeta | null | undefined, positions: PortfolioPosition[]): PortfolioDataMeta {
  if (!metadata) {
    return positions.length === 0 ? { ...defaultMetadata } : { sourceKind: "csv_import", brokerDetails: [] }
  }

  return {
    ...metadata,
    brokerDetails: metadata.brokerDetails ?? [],
  }
}

function buildCombinedMetadata(positions: PortfolioPosition[], brokerDetails: NonNullable<PortfolioDataMeta["brokerDetails"]>): PortfolioDataMeta {
  if (positions.length === 0 || brokerDetails.length === 0) {
    return {
      ...defaultMetadata,
      lastSyncedAt: new Date().toISOString(),
      brokerDetails: [],
    }
  }

  const latestTimestamp = brokerDetails
    .map((detail) => detail.lastSyncedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1)

  return {
    sourceKind: brokerDetails.length === 1 ? brokerDetails[0].sourceKind : "csv_import",
    broker: brokerDetails.length === 1 ? brokerDetails[0].broker : undefined,
    fileName: brokerDetails.length === 1 ? brokerDetails[0].fileName : undefined,
    lastSyncedAt: latestTimestamp,
    syncMode: brokerDetails.some((detail) => detail.syncMode === "scheduled") ? "scheduled" : "manual",
    brokerDetails,
  }
}

function mergeBrokerPortfolio(record: PortfolioRecord, broker: PortfolioPosition["broker"], positions: PortfolioPosition[], activity: PortfolioActivityEvent[], metadata: BrokerImportMetadata): PortfolioRecord {
  const normalizedMetadata = normalizeMetadata(record.metadata, record.positions)
  const currentBrokerDetails = (normalizedMetadata.brokerDetails ?? []).filter((detail) => detail.broker !== broker)
  const currentPositions = record.positions.filter((position) => position.broker !== broker)
  const currentActivity = record.activity.filter((event) => event.broker !== broker)

  const nextBrokerDetails = positions.length === 0
    ? currentBrokerDetails
    : [...currentBrokerDetails, metadata]

  const nextPositions = [...currentPositions, ...positions]
  const nextActivity = [...currentActivity, ...activity]
  const nextMetadata = buildCombinedMetadata(nextPositions, nextBrokerDetails)

  return {
    id: DEFAULT_RECORD_KEY,
    positions: nextPositions.length === 0 ? defaultPortfolio : nextPositions,
    activity: nextActivity,
    metadata: nextPositions.length === 0 ? nextMetadata : nextMetadata,
  }
}

function removeBrokerFromPortfolio(record: PortfolioRecord, broker: PortfolioPosition["broker"]): PortfolioRecord {
  const normalizedMetadata = normalizeMetadata(record.metadata, record.positions)

  const nextPositions = record.positions.filter((position) => position.broker !== broker)
  const nextBrokerDetails = (normalizedMetadata.brokerDetails ?? []).filter((detail) => detail.broker !== broker)

  if (nextPositions.length === 0) {
    return createEmptyPortfolioRecord()
  }

  return {
    id: DEFAULT_RECORD_KEY,
    positions: nextPositions,
    activity: record.activity.filter((event) => event.broker !== broker),
    metadata: buildCombinedMetadata(nextPositions, nextBrokerDetails),
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" })
      }

      if (!db.objectStoreNames.contains(BROKER_CONNECTION_STORE_NAME)) {
        db.createObjectStore(BROKER_CONNECTION_STORE_NAME, { keyPath: "id" })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"))
  })
}

function readPortfolioRecord(db: IDBDatabase): Promise<PortfolioRecord | undefined> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly")
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(DEFAULT_RECORD_KEY)

    request.onsuccess = () => resolve(request.result as PortfolioRecord | undefined)
    request.onerror = () => reject(request.error ?? new Error("Failed to read IndexedDB portfolio record"))
  })
}

function writePortfolioRecord(db: IDBDatabase, positions: PortfolioPosition[], activity: PortfolioActivityEvent[] = [], metadata: PortfolioDataMeta | null = defaultMetadata): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite")
    const store = transaction.objectStore(STORE_NAME)
    store.put({ id: DEFAULT_RECORD_KEY, positions, activity, metadata } satisfies PortfolioRecord)

    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error("Failed to write IndexedDB portfolio record"))
  })
}

function listBrokerConnectionRecords(db: IDBDatabase): Promise<BrowserBrokerConnectionRecord[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(BROKER_CONNECTION_STORE_NAME, "readonly")
    const store = transaction.objectStore(BROKER_CONNECTION_STORE_NAME)
    const request = store.getAll()

    request.onsuccess = () => resolve((request.result as BrowserBrokerConnectionRecord[] | undefined) ?? [])
    request.onerror = () => reject(request.error ?? new Error("Failed to read IndexedDB broker connections"))
  })
}

function readBrokerConnectionRecord(db: IDBDatabase, broker: PortfolioPosition["broker"]): Promise<BrowserBrokerConnectionRecord | undefined> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(BROKER_CONNECTION_STORE_NAME, "readonly")
    const store = transaction.objectStore(BROKER_CONNECTION_STORE_NAME)
    const request = store.get(broker)

    request.onsuccess = () => resolve(request.result as BrowserBrokerConnectionRecord | undefined)
    request.onerror = () => reject(request.error ?? new Error("Failed to read IndexedDB broker connection"))
  })
}

function writeBrokerConnectionRecord(db: IDBDatabase, connection: BrowserBrokerConnectionRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(BROKER_CONNECTION_STORE_NAME, "readwrite")
    const store = transaction.objectStore(BROKER_CONNECTION_STORE_NAME)
    store.put(connection)

    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error("Failed to write IndexedDB broker connection"))
  })
}

function deleteBrokerConnectionRecord(db: IDBDatabase, broker: PortfolioPosition["broker"]): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(BROKER_CONNECTION_STORE_NAME, "readwrite")
    const store = transaction.objectStore(BROKER_CONNECTION_STORE_NAME)
    store.delete(broker)

    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error("Failed to delete IndexedDB broker connection"))
  })
}

async function requestBrowserApiSync(
  broker: PortfolioPosition["broker"],
  credentials: BrokerApiCredentials,
  options: { includeActivity?: boolean } = {}
): Promise<Extract<BrowserApiSyncResponse, { status: "ok" }>> {
  const response = await fetch("/api/integrations/sync-from-api", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      broker,
      apiKey: credentials.apiKey,
      apiSecret: credentials.apiSecret,
      includeActivity: options.includeActivity,
    }),
  })

  const payload = (await response.json()) as BrowserApiSyncResponse

  if (payload.status !== "ok") {
    throw new Error(payload.message)
  }

  return payload
}

async function refreshPortfolioFromSavedBrokerConnections(options: { includeActivity?: boolean } = {}) {
  const connections = await listBrowserBrokerConnections()

  if (connections.length === 0) {
    return {
      record: await readPortfolioFromIndexedDb(),
      syncSummary: null as string | null,
    }
  }

  const results = await Promise.allSettled(
    connections.map(async (connection) => {
      if (connection.broker === "t212" && !connection.apiSecret?.trim()) {
        throw new Error("Saved Trading 212 credentials are incomplete. Re-enter both the API key and API secret on /integrations.")
      }

      const response = await requestBrowserApiSync(connection.broker, {
        apiKey: connection.apiKey,
        apiSecret: connection.apiSecret,
      }, {
        includeActivity: options.includeActivity,
      })
      await replaceBrokerPortfolioInIndexedDb(connection.broker, response.portfolio, response.activity, {
        broker: connection.broker,
        sourceKind: "api_sync",
        lastSyncedAt: new Date().toISOString(),
        syncMode: "manual",
      })

      return {
        broker: connection.broker,
        positionsImported: response.portfolio.length,
        message: response.message,
      }
    })
  )

  const successfulSyncs: BrokerRefreshSummary[] = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : [])

  const failedSyncs = results.flatMap((result) => result.status === "rejected" ? [result.reason] : [])

  const record = await readPortfolioFromIndexedDb()

  if (failedSyncs.length === 0) {
    if (successfulSyncs.length === 0) {
      return { record, syncSummary: null as string | null }
    }

    return {
      record,
      syncSummary: [
        `Refreshed ${successfulSyncs.length} saved broker connection${successfulSyncs.length === 1 ? "" : "s"} from locally stored API keys.`,
        ...successfulSyncs.map((result) => result.message).filter((value): value is string => Boolean(value)),
      ].join(" "),
    }
  }

  const failureMessage = failedSyncs[0] instanceof Error ? failedSyncs[0].message : "A broker API refresh failed."
  const preservedDataMessage = successfulSyncs.length > 0
    ? `Some saved broker connections refreshed successfully, but at least one failed. ${failureMessage}`
    : `Saved broker API refresh failed. Existing browser-local holdings were preserved. ${failureMessage}`

  return {
    record,
    syncSummary: preservedDataMessage,
  }
}

async function readPortfolioFromIndexedDb(): Promise<PortfolioRecord> {
  ensureIndexedDbSupport()
  const db = await openDatabase()
  const existing = await readPortfolioRecord(db)

  if (existing?.positions && Array.isArray(existing.positions) && existing.positions.every(isPortfolioPositionRecord)) {
    return {
      id: DEFAULT_RECORD_KEY,
      positions: existing.positions,
      activity: Array.isArray(existing.activity) ? existing.activity.filter(isPortfolioActivityRecord) : [],
      metadata: normalizeMetadata(existing.metadata, existing.positions),
    }
  }

  const emptyRecord = createEmptyPortfolioRecord()
  await writePortfolioRecord(db, emptyRecord.positions, emptyRecord.activity, emptyRecord.metadata)
  return emptyRecord
}

export async function loadBrowserPortfolioFromIndexedDb() {
  return readPortfolioFromIndexedDb()
}

export async function replaceBrowserPortfolioInIndexedDb(positions: PortfolioPosition[], activity: PortfolioActivityEvent[] = [], metadata: PortfolioDataMeta | null = defaultMetadata) {
  ensureIndexedDbSupport()
  const db = await openDatabase()
  await writePortfolioRecord(db, positions, activity, metadata)
}

export async function listBrowserBrokerConnections() {
  ensureIndexedDbSupport()
  const db = await openDatabase()
  return listBrokerConnectionRecords(db)
}

export async function getBrowserBrokerConnection(broker: PortfolioPosition["broker"]) {
  ensureIndexedDbSupport()
  const db = await openDatabase()
  return readBrokerConnectionRecord(db, broker)
}

export async function saveBrowserBrokerConnection(broker: PortfolioPosition["broker"], credentials: BrokerApiCredentials) {
  ensureIndexedDbSupport()
  const trimmedApiKey = credentials.apiKey.trim()
  const trimmedApiSecret = credentials.apiSecret?.trim() ?? ""

  if (!trimmedApiKey) {
    throw new Error("Enter an API key before saving it to this browser.")
  }

  if (broker === "t212" && !trimmedApiSecret) {
    throw new Error("Enter the Trading 212 API secret before saving credentials to this browser.")
  }

  const db = await openDatabase()
  await writeBrokerConnectionRecord(db, {
    id: broker,
    broker,
    apiKey: trimmedApiKey,
    apiSecret: trimmedApiSecret || undefined,
    updatedAt: new Date().toISOString(),
  })
}

export async function removeBrowserBrokerConnection(broker: PortfolioPosition["broker"]) {
  ensureIndexedDbSupport()
  const db = await openDatabase()
  await deleteBrokerConnectionRecord(db, broker)
}

export async function syncBrokerPortfolioFromBrowserApiKey(broker: PortfolioPosition["broker"], credentials: BrokerApiCredentials) {
  const response = await requestBrowserApiSync(broker, credentials, { includeActivity: true })
  await replaceBrokerPortfolioInIndexedDb(broker, response.portfolio, response.activity, {
    broker,
    sourceKind: "api_sync",
    lastSyncedAt: new Date().toISOString(),
    syncMode: "manual",
  })

  return response.portfolio
}

export async function replaceBrokerPortfolioInIndexedDb(
  broker: PortfolioPosition["broker"],
  positions: PortfolioPosition[],
  activity: PortfolioActivityEvent[] | undefined,
  metadata: BrokerImportMetadata
) {
  const currentRecord = await readPortfolioFromIndexedDb()
  const nextRecord = mergeBrokerPortfolio(
    currentRecord,
    broker,
    positions,
    activity ?? currentRecord.activity.filter((event) => event.broker === broker),
    metadata
  )
  await replaceBrowserPortfolioInIndexedDb(nextRecord.positions, nextRecord.activity, nextRecord.metadata)
}

export async function resetBrokerPortfolioInIndexedDb(broker: PortfolioPosition["broker"]) {
  const currentRecord = await readPortfolioFromIndexedDb()
  const nextRecord = removeBrokerFromPortfolio(currentRecord, broker)
  await replaceBrowserPortfolioInIndexedDb(nextRecord.positions, nextRecord.activity, nextRecord.metadata)
}

export async function resetBrowserPortfolioInIndexedDb() {
  const emptyRecord = createEmptyPortfolioRecord()
  await replaceBrowserPortfolioInIndexedDb(emptyRecord.positions, emptyRecord.activity, emptyRecord.metadata)
}

export class BrowserIndexedDbPortfolioRepository implements ClientPortfolioRepository {
  async getPortfolio(options: ClientPortfolioRequestOptions = {}): Promise<PortfolioApiResponse> {
    if (typeof window === "undefined" || typeof window.indexedDB === "undefined") {
      return createFailurePortfolioResponse(
        "error",
        "browser",
        "browser_local",
        "IndexedDB is only available in a browser that supports it."
      )
    }

    const { record, syncSummary } = options.refresh
      ? await refreshPortfolioFromSavedBrokerConnections({ includeActivity: options.includeActivity })
      : { record: await readPortfolioFromIndexedDb(), syncSummary: null as string | null }

    return createSuccessPortfolioResponse(
      record.positions,
      "browser",
      "browser_local",
      syncSummary
        ?? (record.metadata?.sourceKind === "csv_import"
          ? "Using browser-local broker data saved in this device. Broker slices are combined into one unified dashboard in this mode, but background notifications still require a server-backed alert pipeline."
          : record.metadata?.sourceKind === "api_sync"
            ? "Using browser-local portfolio data last refreshed from locally stored broker API keys. Refresh while the app is open to pull newer positions, but background notifications still require a server-backed alert pipeline."
            : record.positions.length === 0
              ? "No portfolio data is stored in this browser yet. Connect Trading 212 or eToro to get started."
              : "Using browser-local portfolio data stored in IndexedDB. This mode supports local monitoring on the current device, but it does not provide server-backed background notifications after the app is closed."),
      record.positions.length === 0 ? null : record.metadata ?? defaultMetadata,
      record.activity
    )
  }
}

