/**
 * @file storage.ts
 * @description SmartBookmark Pro 스토리지 레이어
 *
 * chrome.storage.local, chrome.storage.session, IndexedDB를 통합적으로
 * 관리하는 래퍼 클래스들을 제공합니다.
 *
 * - ChromeStorage   : 영구 로컬 데이터 (북마크, 설정 등)
 * - SessionStorage  : 브라우저 종료 시 소멸하는 임시 데이터 (인증 상태 등)
 * - IndexedDBStorage: 대용량 YouTube 시청 기록 등 구조적 데이터
 */

// ---------------------------------------------------------------------------
// ChromeStorage
// ---------------------------------------------------------------------------

/**
 * chrome.storage.local 래퍼 클래스.
 * 브라우저를 닫아도 유지되는 영구 로컬 스토리지입니다.
 */
export class ChromeStorage {
  /**
   * 지정한 키에 해당하는 값을 가져옵니다.
   * @param key 조회할 스토리지 키
   * @returns 저장된 값, 없으면 undefined
   */
  async get<T>(key: string): Promise<T | undefined> {
    try {
      const result = await chrome.storage.local.get(key);
      return result[key] as T | undefined;
    } catch (error) {
      console.error(`[ChromeStorage] get 실패 - key: ${key}`, error);
      return undefined;
    }
  }

  /**
   * 지정한 키에 값을 저장합니다.
   * @param key 저장할 스토리지 키
   * @param value 저장할 값
   */
  async set(key: string, value: unknown): Promise<void> {
    try {
      await chrome.storage.local.set({ [key]: value });
    } catch (error) {
      console.error(`[ChromeStorage] set 실패 - key: ${key}`, error);
      throw error;
    }
  }

  /**
   * 지정한 키와 해당 값을 스토리지에서 삭제합니다.
   * @param key 삭제할 스토리지 키
   */
  async remove(key: string): Promise<void> {
    try {
      await chrome.storage.local.remove(key);
    } catch (error) {
      console.error(`[ChromeStorage] remove 실패 - key: ${key}`, error);
      throw error;
    }
  }

  /**
   * 스토리지에 저장된 모든 키-값 쌍을 가져옵니다.
   * @returns 전체 스토리지 객체
   */
  async getAll(): Promise<Record<string, unknown>> {
    try {
      return await chrome.storage.local.get(null);
    } catch (error) {
      console.error('[ChromeStorage] getAll 실패', error);
      return {};
    }
  }
}

// ---------------------------------------------------------------------------
// SessionStorage
// ---------------------------------------------------------------------------

/**
 * chrome.storage.session 래퍼 클래스.
 * 브라우저가 종료되면 소멸하는 임시 세션 스토리지입니다.
 * 인증 토큰, 임시 사용자 상태 등에 사용합니다.
 */
export class SessionStorage {
  /**
   * 지정한 키에 해당하는 세션 값을 가져옵니다.
   * @param key 조회할 세션 키
   * @returns 저장된 값, 없으면 undefined
   */
  async get<T>(key: string): Promise<T | undefined> {
    try {
      const result = await chrome.storage.session.get(key);
      return result[key] as T | undefined;
    } catch (error) {
      console.error(`[SessionStorage] get 실패 - key: ${key}`, error);
      return undefined;
    }
  }

  /**
   * 지정한 키에 세션 값을 저장합니다.
   * @param key 저장할 세션 키
   * @param value 저장할 값
   */
  async set(key: string, value: unknown): Promise<void> {
    try {
      await chrome.storage.session.set({ [key]: value });
    } catch (error) {
      console.error(`[SessionStorage] set 실패 - key: ${key}`, error);
      throw error;
    }
  }
}

// ---------------------------------------------------------------------------
// IndexedDBStorage
// ---------------------------------------------------------------------------

/**
 * IndexedDB 오브젝트 스토어 이름 타입.
 * 허용된 스토어명만 사용하도록 강제합니다.
 */
export type IDBStoreName =
  | 'youtube_videos'
  | 'youtube_categories'
  | 'youtube_channels'
  | 'youtube_timestamps'
  | 'tab_sessions'
  | 'highlights';

/**
 * IndexedDB 래퍼 클래스.
 * YouTube 시청 기록, 탭 세션, 하이라이트 등 대용량 구조적 데이터를 관리합니다.
 *
 * 오브젝트 스토어 목록:
 * - youtube_videos    : YouTube 영상 정보 (인덱스: channelName, watchedAt, category)
 * - youtube_categories: YouTube 카테고리 분류
 * - youtube_channels  : YouTube 채널 정보
 * - youtube_timestamps: YouTube 타임스탬프 북마크
 * - tab_sessions      : 탭 세션 기록 (인덱스: createdAt)
 * - highlights        : 텍스트 하이라이트 (인덱스: bookmarkId)
 */
export class IndexedDBStorage {
  /** IndexedDB 데이터베이스 이름 */
  static readonly DB_NAME = 'SmartBookmarkDB';

  /** IndexedDB 스키마 버전 */
  static readonly DB_VERSION = 1;

  /** 열린 DB 인스턴스 캐시 */
  private dbInstance: IDBDatabase | null = null;

  /**
   * IndexedDB 데이터베이스를 열거나 업그레이드합니다.
   * 이미 열려 있는 경우 캐시된 인스턴스를 반환합니다.
   * @returns 열린 IDBDatabase 인스턴스
   */
  async openDB(): Promise<IDBDatabase> {
    if (this.dbInstance) {
      return this.dbInstance;
    }

    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(
        IndexedDBStorage.DB_NAME,
        IndexedDBStorage.DB_VERSION
      );

      // DB 업그레이드 핸들러 - 스키마 초기화 및 마이그레이션
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // ── youtube_videos 스토어 ───────────────────────────────────────────
        if (!db.objectStoreNames.contains('youtube_videos')) {
          const videoStore = db.createObjectStore('youtube_videos', {
            keyPath: 'id',
          });
          // 채널명으로 필터링
          videoStore.createIndex('channelName', 'channelName', { unique: false });
          // 시청 시각 기준 정렬
          videoStore.createIndex('watchedAt', 'watchedAt', { unique: false });
          // 카테고리 기준 필터링
          videoStore.createIndex('category', 'category', { unique: false });
        }

        // ── youtube_categories 스토어 ───────────────────────────────────────
        if (!db.objectStoreNames.contains('youtube_categories')) {
          db.createObjectStore('youtube_categories', { keyPath: 'id' });
        }

        // ── youtube_channels 스토어 ────────────────────────────────────────
        if (!db.objectStoreNames.contains('youtube_channels')) {
          db.createObjectStore('youtube_channels', { keyPath: 'id' });
        }

        // ── youtube_timestamps 스토어 ───────────────────────────────────────
        if (!db.objectStoreNames.contains('youtube_timestamps')) {
          db.createObjectStore('youtube_timestamps', { keyPath: 'id' });
        }

        // ── tab_sessions 스토어 ────────────────────────────────────────────
        if (!db.objectStoreNames.contains('tab_sessions')) {
          const tabStore = db.createObjectStore('tab_sessions', {
            keyPath: 'id',
          });
          // 생성 시각 기준 정렬
          tabStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // ── highlights 스토어 ──────────────────────────────────────────────
        if (!db.objectStoreNames.contains('highlights')) {
          const highlightStore = db.createObjectStore('highlights', {
            keyPath: 'id',
          });
          // 북마크 ID로 하이라이트 그룹 조회
          highlightStore.createIndex('bookmarkId', 'bookmarkId', {
            unique: false,
          });
        }
      };

      request.onsuccess = (event) => {
        this.dbInstance = (event.target as IDBOpenDBRequest).result;

        // 예기치 않은 버전 변경 시 캐시 무효화
        this.dbInstance.onversionchange = () => {
          this.dbInstance?.close();
          this.dbInstance = null;
        };

        resolve(this.dbInstance);
      };

      request.onerror = (event) => {
        const error = (event.target as IDBOpenDBRequest).error;
        console.error('[IndexedDBStorage] DB 열기 실패', error);
        reject(error);
      };
    });
  }

  /**
   * 지정한 스토어에 값을 저장(삽입 또는 덮어쓰기)합니다.
   * 저장 객체에는 keyPath 필드('id')가 포함되어 있어야 합니다.
   * @param store 대상 오브젝트 스토어 이름
   * @param key 레코드의 id 값
   * @param value 저장할 객체 (id 필드 자동 주입)
   */
  async put(store: IDBStoreName, key: string, value: unknown): Promise<void> {
    try {
      const db = await this.openDB();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        const objectStore = tx.objectStore(store);

        // keyPath가 'id'이므로 value에 id를 병합하여 저장
        const record =
          value !== null && typeof value === 'object'
            ? { id: key, ...(value as object) }
            : { id: key, data: value };

        const request = objectStore.put(record);

        request.onsuccess = () => resolve();
        request.onerror = (event) => {
          const error = (event.target as IDBRequest).error;
          console.error(
            `[IndexedDBStorage] put 실패 - store: ${store}, key: ${key}`,
            error
          );
          reject(error);
        };
      });
    } catch (error) {
      console.error(
        `[IndexedDBStorage] put 트랜잭션 실패 - store: ${store}`,
        error
      );
      throw error;
    }
  }

  /**
   * 지정한 스토어에서 키에 해당하는 레코드를 가져옵니다.
   * @param store 대상 오브젝트 스토어 이름
   * @param key 조회할 레코드 id
   * @returns 레코드 객체, 없으면 undefined
   */
  async get<T>(store: IDBStoreName, key: string): Promise<T | undefined> {
    try {
      const db = await this.openDB();
      return new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(store, 'readonly');
        const objectStore = tx.objectStore(store);
        const request = objectStore.get(key);

        request.onsuccess = (event) => {
          resolve((event.target as IDBRequest<T>).result);
        };
        request.onerror = (event) => {
          const error = (event.target as IDBRequest).error;
          console.error(
            `[IndexedDBStorage] get 실패 - store: ${store}, key: ${key}`,
            error
          );
          reject(error);
        };
      });
    } catch (error) {
      console.error(
        `[IndexedDBStorage] get 트랜잭션 실패 - store: ${store}`,
        error
      );
      return undefined;
    }
  }

  /**
   * 지정한 스토어의 모든 레코드를 가져옵니다.
   * @param store 대상 오브젝트 스토어 이름
   * @returns 전체 레코드 배열
   */
  async getAll<T>(store: IDBStoreName): Promise<T[]> {
    try {
      const db = await this.openDB();
      return new Promise<T[]>((resolve, reject) => {
        const tx = db.transaction(store, 'readonly');
        const objectStore = tx.objectStore(store);
        const request = objectStore.getAll();

        request.onsuccess = (event) => {
          resolve((event.target as IDBRequest<T[]>).result ?? []);
        };
        request.onerror = (event) => {
          const error = (event.target as IDBRequest).error;
          console.error(
            `[IndexedDBStorage] getAll 실패 - store: ${store}`,
            error
          );
          reject(error);
        };
      });
    } catch (error) {
      console.error(
        `[IndexedDBStorage] getAll 트랜잭션 실패 - store: ${store}`,
        error
      );
      return [];
    }
  }

  /**
   * 지정한 스토어에서 키에 해당하는 레코드를 삭제합니다.
   * @param store 대상 오브젝트 스토어 이름
   * @param key 삭제할 레코드 id
   */
  async delete(store: IDBStoreName, key: string): Promise<void> {
    try {
      const db = await this.openDB();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        const objectStore = tx.objectStore(store);
        const request = objectStore.delete(key);

        request.onsuccess = () => resolve();
        request.onerror = (event) => {
          const error = (event.target as IDBRequest).error;
          console.error(
            `[IndexedDBStorage] delete 실패 - store: ${store}, key: ${key}`,
            error
          );
          reject(error);
        };
      });
    } catch (error) {
      console.error(
        `[IndexedDBStorage] delete 트랜잭션 실패 - store: ${store}`,
        error
      );
      throw error;
    }
  }

  /**
   * 지정한 스토어의 모든 레코드를 삭제합니다.
   * @param store 비울 오브젝트 스토어 이름
   */
  async clear(store: IDBStoreName): Promise<void> {
    try {
      const db = await this.openDB();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        const objectStore = tx.objectStore(store);
        const request = objectStore.clear();

        request.onsuccess = () => resolve();
        request.onerror = (event) => {
          const error = (event.target as IDBRequest).error;
          console.error(
            `[IndexedDBStorage] clear 실패 - store: ${store}`,
            error
          );
          reject(error);
        };
      });
    } catch (error) {
      console.error(
        `[IndexedDBStorage] clear 트랜잭션 실패 - store: ${store}`,
        error
      );
      throw error;
    }
  }

  /**
   * 지정한 스토어에 저장된 레코드 수를 반환합니다.
   * @param store 대상 오브젝트 스토어 이름
   * @returns 레코드 총 개수
   */
  async count(store: IDBStoreName): Promise<number> {
    try {
      const db = await this.openDB();
      return new Promise<number>((resolve, reject) => {
        const tx = db.transaction(store, 'readonly');
        const objectStore = tx.objectStore(store);
        const request = objectStore.count();

        request.onsuccess = (event) => {
          resolve((event.target as IDBRequest<number>).result);
        };
        request.onerror = (event) => {
          const error = (event.target as IDBRequest).error;
          console.error(
            `[IndexedDBStorage] count 실패 - store: ${store}`,
            error
          );
          reject(error);
        };
      });
    } catch (error) {
      console.error(
        `[IndexedDBStorage] count 트랜잭션 실패 - store: ${store}`,
        error
      );
      return 0;
    }
  }

  /**
   * 지정한 인덱스의 값과 일치하는 모든 레코드를 가져옵니다.
   *
   * 예시:
   * - youtube_videos에서 특정 채널의 영상 목록 조회
   * - highlights에서 특정 북마크의 하이라이트 목록 조회
   *
   * @param store 대상 오브젝트 스토어 이름
   * @param indexName 검색에 사용할 인덱스 이름
   * @param value 인덱스에서 일치시킬 값
   * @returns 일치하는 레코드 배열
   */
  async getAllByIndex<T>(
    store: IDBStoreName,
    indexName: string,
    value: unknown
  ): Promise<T[]> {
    try {
      const db = await this.openDB();
      return new Promise<T[]>((resolve, reject) => {
        const tx = db.transaction(store, 'readonly');
        const objectStore = tx.objectStore(store);

        let index: IDBIndex;
        try {
          index = objectStore.index(indexName);
        } catch {
          console.error(
            `[IndexedDBStorage] 인덱스 없음 - store: ${store}, index: ${indexName}`
          );
          resolve([]);
          return;
        }

        const request = index.getAll(IDBKeyRange.only(value));

        request.onsuccess = (event) => {
          resolve((event.target as IDBRequest<T[]>).result ?? []);
        };
        request.onerror = (event) => {
          const error = (event.target as IDBRequest).error;
          console.error(
            `[IndexedDBStorage] getAllByIndex 실패 - store: ${store}, index: ${indexName}`,
            error
          );
          reject(error);
        };
      });
    } catch (error) {
      console.error(
        `[IndexedDBStorage] getAllByIndex 트랜잭션 실패 - store: ${store}`,
        error
      );
      return [];
    }
  }
}

// ---------------------------------------------------------------------------
// 싱글톤 인스턴스 내보내기
// ---------------------------------------------------------------------------

/** chrome.storage.local 싱글톤 인스턴스 */
export const chromeStorage = new ChromeStorage();

/**
 * chrome.storage.session 싱글톤 인스턴스.
 * 전역 변수 sessionStorage와 이름 충돌을 피하기 위해
 * 별칭(chromeSessionStorage)도 함께 내보냅니다.
 */
export const sessionStorage = new SessionStorage();
export const chromeSessionStorage = sessionStorage;

/** IndexedDB 싱글톤 인스턴스 */
export const db = new IndexedDBStorage();
