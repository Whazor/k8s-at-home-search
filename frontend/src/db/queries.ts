import { Subject } from 'rxjs';
import { SQLLiteDialect, sql, Kysely } from './sqlite';


interface Repo {
  repo_name: string,
  url: string,
  branch: string,
  stars: number
}
interface FluxHelmRelease {
  release_name: string,
  chart_name: string,
  chart_version?: string,
  namespace?: string,
  repo_name: string,
  hajimari_icon?: string,
  lines: number,
  url: string,
  timestamp: string
  helm_repo_name: string,
  helm_repo_namespace?: string,
  val?: string
}

interface FluxHelmReleaseValues {
  url: string,
  val?: string
}

interface FluxHelmRepo {
  helm_repo_name: string,
  namespace?: string,
  helm_repo_url: string,
  interval?: string,
  repo_name: string,
  lines: number,
  url: string,
  timestamp: string
}

interface Database1 {
  repo: Repo,
  flux_helm_release: FluxHelmRelease,
  flux_helm_repo: FluxHelmRepo
}

interface Database2 {
  flux_helm_release_values: FluxHelmReleaseValues
}

const interesting = [
  // ingress
  ...['traefik', 'nginx', 'ingress-nginx', 'istio'],
  // storage backends
  ...['rook-ceph', 'longhorn', 'openebs'],
  // backup
  ...['k10', 'velero',]

]

export interface Progress {
  received: number; contentLength: number;
}

export const dataProgressSubject = new Subject<Progress>();

export async function dataProgress(dbFile: string) {
  const response = await fetch(dbFile);
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No db found');
  const contentLength = Number(response.headers.get('content-length'));
  let received = 0;
  let lastSend = 0;
  let chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    received += value.length;
    if (received - lastSend > 1000) {
      dataProgressSubject.next({ received, contentLength: Math.max(received, contentLength) });
      lastSend = received;
    }
  }
  let chunksAll = new Uint8Array(received);
  let position = 0;
  for (let chunk of chunks) {
    chunksAll.set(chunk, position); // (4.2)
    position += chunk.length;
  }
  dataProgressSubject.complete();
  return chunksAll;
}

const dataPromise = dataProgress('repos.db');

const db = new Kysely<Database1>({
  dialect: new SQLLiteDialect(dataPromise),
});

async function copyTables() {
  const data2Promise = dataProgress('repos-extended.db');

  const db2 = new Kysely<Database2>({
    dialect: new SQLLiteDialect(data2Promise),
  });
  for (const fhrv of await db2.selectFrom('flux_helm_release_values')
    .selectAll().execute()) {
    console.log(fhrv)

  }
}

export function searchQuery(query: {
  search?: string,
  repo?: string
}) {
  let { search, repo } = query;
  let select = db.selectFrom('flux_helm_release as fhr')
    .innerJoin('repo', 'fhr.repo_name', 'repo.repo_name')
    .leftJoin('flux_helm_repo', join =>
      join.onRef('fhr.repo_name', '=', 'flux_helm_repo.repo_name')
        .onRef('fhr.helm_repo_name', '=', 'flux_helm_repo.helm_repo_name')
        .onRef('fhr.helm_repo_namespace', '=', 'flux_helm_repo.namespace')
    )
    .select([
      sql<string | undefined>`(select group_concat(distinct intr.chart_name) 
                 from flux_helm_release intr
                 where intr.repo_name = fhr.repo_name and 
                 intr.chart_name in (${sql.join(interesting)}))`.as('releases'),
      'fhr.release_name as release_name',
      'fhr.chart_name as chart_name',
      'fhr.chart_version as chart_version',
      'flux_helm_repo.helm_repo_name as helm_repo_name',
      // 'flux_helm_repo.namespace as helm_repo_namespace',
      'flux_helm_repo.url as helm_repo_url',
      'repo.repo_name as repo_name',
      'repo.url as repo_url',
      'fhr.url as url',
      'fhr.hajimari_icon as hajimari_icon',
      'fhr.lines as lines',
      'fhr.timestamp as timestamp',
      'repo.stars as stars'
    ]);
  if (search) {
    search = search.trim().replace(' ', '%');
    select = select.where('fhr.chart_name', 'like', `%${search}%`)
      .orWhere('fhr.release_name', 'like', `%${search}%`)
  }
  if (repo) {
    select = select.where('fhr.repo_name', '=', repo);
  }

  select = select.groupBy('fhr.url')
    .orderBy('timestamp', 'desc');
  return select.execute();
}

// CREATE TABLE json_tree(
//   key ANY,             -- key for current element relative to its parent
//   value ANY,           -- value for the current element
//   type TEXT,           -- 'object','array','string','integer', etc.
//   atom ANY,            -- value for primitive types, null for array & object
//   id INTEGER,          -- integer ID for this element
//   parent INTEGER,      -- integer ID for the parent of this element
//   fullkey TEXT,        -- full path describing the current element
//   path TEXT,           -- path to the container of the current row
//   json JSON HIDDEN,    -- 1st input parameter: the raw JSON
//   root TEXT HIDDEN     -- 2nd input parameter: the PATH at which to start
// );
interface SqliteJsonTreeWalk {
  key: string,
  value: string,
  type: string,
  atom: string,
  id: number,
  parent: number,
  fullkey: string,
  path: string,
}

export function releasesByChartname(chartName: string) {

  const a = db
    .selectFrom([
      'flux_helm_release as fhr',
      sql<SqliteJsonTreeWalk>`json_each(fhr.val)`.as('val')
    ]).select([
      sql<string>`val.key`.as('key'),
      sql<number>`count(val.key)`.as('amount'),
    ])
    .where('fhr.chart_name', '=', chartName)
    .groupBy('val.key')
    .orderBy('amount', 'desc');
  return a.execute();
}

export function releasesByValue(chartname: string, value: string) {
  const a = db
    .selectFrom([
      'flux_helm_release as fhr',
      sql<SqliteJsonTreeWalk>`json_each(fhr.val)`.as('val')
    ]).select([
      'fhr.repo_name as repo_name',
      sql<string | undefined>`(select group_concat(distinct intr.chart_name) 
                 from flux_helm_release intr
                 where intr.repo_name = fhr.repo_name and 
                 intr.chart_name in (${sql.join(interesting)}))`.as('releases'),
      'val.key as keyName',
      'val.value as value',
      'fhr.url as url',
      'fhr.release_name as release_name'
    ])
    .where('fhr.chart_name', '=', chartname)
    .where('val.key', '=', value);
  return a.execute();
}

export function wordcloud(atLeast = 1, onlyWithIcon = false) {
  console.log("working")
  let st = db.selectFrom('flux_helm_release')
    .groupBy('chart_name')
    .select([
      'chart_name',
      sql<number>`count(*)`.as('count'),
      sql<string | undefined>`
        (select ci.hajimari_icon from flux_helm_release ci
        where ci.chart_name = flux_helm_release.chart_name and 
          ci.hajimari_icon is not null and
          ci.hajimari_icon != ''
        group by ci.hajimari_icon
        order by count(ci.hajimari_icon) desc)`.as('icon'),
    ])
    .orderBy('count', 'desc');
  if (!onlyWithIcon) {
    st = st.having(sql<number>`count(*)`, '>', atLeast);
  } else {
    st = st.having(sql<string | undefined>`icon`, '!=', 'null');
  }
  return st.execute();
}
export function topReposQuery() {
  const st = db.selectFrom('repo')
    .select([
      'repo.repo_name as name',
      'repo.url as url',
      'repo.stars as stars',
      sql<string | undefined>`(select group_concat(distinct intr.chart_name) 
           from flux_helm_release intr
           where intr.repo_name = repo.repo_name and 
           intr.chart_name in (${sql.join(interesting)}))`.as('releases'),
      sql<number>`
        (select count(distinct fr.release_name) from flux_helm_release fr
        where fr.repo_name = repo.repo_name)`.as('count'),
    ]).orderBy('count', 'desc');
  return st.execute();
}
