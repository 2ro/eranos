// ---------------------------------------------------------------------------
// Venezuelan territorial data for the event dashboard (stripped version).
//
// Contains only states (24) and municipalities (379) needed for the dashboard.
// Parroquias, content fallbacks, and legacy migration logic are excluded.
//
// Code format (official CNE numbering):
//   State:        NN          (e.g. "13" = Miranda)
//   Municipality: NN-NNN…     (e.g. "13-1316" = Baruta, Miranda)
// ---------------------------------------------------------------------------

export interface TerritorialState {
  code: string;   // e.g. "13"
  label: string;  // e.g. "Miranda"
}

export interface Municipality {
  code: string;        // e.g. "13-1316"
  label: string;       // e.g. "Baruta"
  stateCode: string;   // e.g. "13"
  stateLabel: string;  // e.g. "Miranda"
}

// ---------------------------------------------------------------------------
// 24 territorial states (23 states + Distrito Capital)
// ---------------------------------------------------------------------------

const STATES: [string, string][] = [
  ['01', 'Distrito Capital'],
  ['02', 'Anzoátegui'],
  ['03', 'Apure'],
  ['04', 'Aragua'],
  ['05', 'Barinas'],
  ['06', 'Bolívar'],
  ['07', 'Carabobo'],
  ['08', 'Cojedes'],
  ['09', 'Falcón'],
  ['10', 'Guárico'],
  ['11', 'Lara'],
  ['12', 'Mérida'],
  ['13', 'Miranda'],
  ['14', 'Monagas'],
  ['15', 'Nueva Esparta'],
  ['16', 'Portuguesa'],
  ['17', 'Sucre'],
  ['18', 'Táchira'],
  ['19', 'Trujillo'],
  ['20', 'Yaracuy'],
  ['21', 'Zulia'],
  ['22', 'Amazonas'],
  ['23', 'Delta Amacuro'],
  ['24', 'La Guaira'],
];

const stateByCode = new Map<string, TerritorialState>(
  STATES.map(([code, label]) => [code, { code, label }]),
);

/** Public list of all 24 states. */
export const VE_STATES: TerritorialState[] = STATES.map(
  ([code, label]) => ({ code, label }),
);

// ---------------------------------------------------------------------------
// 379 Municipalities — grouped by state code
// ---------------------------------------------------------------------------

const MUNICIPALITY_DATA: [string, string][] = [
  // VE-01 Distrito Capital
  ['01-10101', 'Altagracia'], ['01-10102', 'Candelaria'], ['01-10103', 'Catedral'],
  ['01-10104', 'La Pastora'], ['01-10105', 'San Agustín'], ['01-10106', 'San José'],
  ['01-10107', 'San Juan'], ['01-10108', 'Santa Rosalía'], ['01-10109', 'Santa Teresa'],
  ['01-10110', 'Sucre'], ['01-10111', '23 de Enero'], ['01-10112', 'Antimano'],
  ['01-10113', 'El Recreo'], ['01-10114', 'El Valle'], ['01-10115', 'La Vega'],
  ['01-10116', 'Macarao'], ['01-10117', 'Caricuao'], ['01-10118', 'El Junquito'],
  ['01-10119', 'Coche'], ['01-10120', 'San Pedro'], ['01-10121', 'San Bernardino'],
  ['01-10122', 'El Paraíso'],
  // VE-02 Anzoátegui
  ['02-201', 'Anaco'], ['02-202', 'Aragua'], ['02-203', 'Bolívar'], ['02-204', 'Bruzual'],
  ['02-205', 'Cajigal'], ['02-206', 'Freites'], ['02-207', 'Independencia'],
  ['02-208', 'Libertad'], ['02-209', 'Miranda'], ['02-210', 'Monagas'],
  ['02-211', 'Peñalver'], ['02-212', 'Simón Rodríguez'], ['02-213', 'Sotillo'],
  ['02-214', 'Guanipa'], ['02-215', 'Guanta'], ['02-216', 'Píritu'],
  ['02-217', 'Diego Bautista Urbaneja'], ['02-218', 'Carvajal'], ['02-219', 'Santa Ana'],
  ['02-220', 'McGregor'], ['02-221', 'San Juan Capistrano'],
  // VE-03 Apure
  ['03-301', 'Achaguas'], ['03-302', 'Muñoz'], ['03-303', 'Páez'],
  ['03-304', 'Pedro Camejo'], ['03-305', 'Rómulo Gallegos'], ['03-306', 'San Fernando'],
  ['03-307', 'Biruaca'],
  // VE-04 Aragua
  ['04-401', 'Girardot'], ['04-402', 'Santiago Mariño'], ['04-403', 'José Félix Ribas'],
  ['04-404', 'San Casimiro'], ['04-405', 'San Sebastián'], ['04-406', 'Sucre'],
  ['04-407', 'Urdaneta'], ['04-408', 'Zamora'], ['04-409', 'Libertador'],
  ['04-410', 'José Ángel Lamas'], ['04-411', 'Bolívar'], ['04-412', 'Santos Michelena'],
  ['04-413', 'Mario Briceño Iragorry'], ['04-414', 'Tovar'], ['04-415', 'Camatagua'],
  ['04-416', 'José Rafael Revenga'], ['04-417', 'Francisco Linares Alcántara'],
  ['04-418', 'Ocumare de la Costa de Oro'],
  // VE-05 Barinas
  ['05-501', 'Arismendi'], ['05-503', 'Bolívar'], ['05-504', 'Ezequiel Zamora'],
  ['05-505', 'Obispos'], ['05-506', 'Pedraza'], ['05-507', 'Rojas'], ['05-508', 'Sosa'],
  ['05-509', 'Alberto Arvelo Torrealba'], ['05-510', 'Antonio José de Sucre'],
  ['05-511', 'Cruz Paredes'], ['05-512', 'Andrés Eloy Blanco'],
  ['05-50201', 'Barinas 1'], ['05-50202', 'Barinas 2'],
  // VE-06 Bolívar
  ['06-602', 'Cedeño'], ['06-603', 'Angostura del Orinoco'], ['06-604', 'Piar'],
  ['06-605', 'Roscio'], ['06-606', 'Sucre'], ['06-607', 'Sifontes'],
  ['06-608', 'Angostura'], ['06-609', 'Gran Sabana'], ['06-610', 'El Callao'],
  ['06-611', 'Padre Pedro Chien'], ['06-60001', 'Caroní 1'], ['06-60002', 'Caroní 2'],
  ['06-60003', 'Caroní 3'],
  // VE-07 Carabobo
  ['07-701', 'Bejuma'], ['07-702', 'Carlos Arvelo'], ['07-703', 'Diego Ibarra'],
  ['07-704', 'Guacara'], ['07-705', 'Montalbán'], ['07-706', 'Juan José Mora'],
  ['07-707', 'Puerto Cabello'], ['07-708', 'San Joaquín'], ['07-709', 'Valencia'],
  ['07-710', 'Miranda'], ['07-711', 'Los Guayos'], ['07-712', 'Naguanagua'],
  ['07-713', 'San Diego'], ['07-714', 'Libertador'], ['07-70001', 'Miguel Peña'],
  // VE-08 Cojedes
  ['08-801', 'Anzoátegui'], ['08-802', 'Tinaquillo'], ['08-803', 'Girardot'],
  ['08-804', 'Pao de San Juan Bautista'], ['08-805', 'Ricaurte'],
  ['08-806', 'Ezequiel Zamora'], ['08-807', 'Tinaco'], ['08-808', 'Lima Blanco'],
  ['08-809', 'Rómulo Gallegos'],
  // VE-09 Falcón
  ['09-901', 'Acosta'], ['09-902', 'Bolívar'], ['09-903', 'Buchivacoa'],
  ['09-904', 'Carirubana'], ['09-905', 'Colina'], ['09-906', 'Democracia'],
  ['09-907', 'Falcón'], ['09-908', 'Federación'], ['09-909', 'Mauroa'],
  ['09-910', 'Miranda'], ['09-911', 'Petit'], ['09-912', 'Silva'], ['09-913', 'Zamora'],
  ['09-914', 'Dabajuro'], ['09-915', 'Monseñor Iturriza'], ['09-916', 'Los Taques'],
  ['09-917', 'Píritu'], ['09-918', 'Unión'], ['09-919', 'San Francisco'],
  ['09-920', 'Jacura'], ['09-921', 'Cacique Manaure'], ['09-922', 'Palmasola'],
  ['09-923', 'Sucre'], ['09-924', 'Urumaco'], ['09-925', 'Tocópero'],
  // VE-10 Guárico
  ['10-1001', 'Infante'], ['10-1002', 'Mellado'], ['10-1003', 'Miranda'],
  ['10-1004', 'Monagas'], ['10-1005', 'Ribas'], ['10-1006', 'Juan Germán Roscio'],
  ['10-1007', 'Zaraza'], ['10-1008', 'Camaguán'], ['10-1009', 'San José de Guaribe'],
  ['10-1010', 'Juan José Rondón'], ['10-1011', 'El Socorro'], ['10-1012', 'Ortiz'],
  ['10-1013', 'Santa María de Ipire'], ['10-1014', 'Chaguaramas'],
  ['10-1015', 'San Gerónimo de Guayabal'],
  // VE-11 Lara
  ['11-1101', 'Crespo'], ['11-1103', 'Jiménez'], ['11-1104', 'Morán'],
  ['11-1105', 'Palavecino'], ['11-1106', 'Torres'], ['11-1107', 'Urdaneta'],
  ['11-1108', 'Andrés Eloy Blanco'], ['11-1109', 'Simón Planas'],
  ['11-110001', 'Iribarren Este'], ['11-110002', 'Iribarren Norte'],
  ['11-110003', 'Iribarren Oeste'], ['11-110004', 'Iribarren Sur'],
  // VE-12 Mérida
  ['12-1201', 'Alberto Adriani'], ['12-1202', 'Andrés Bello'],
  ['12-1203', 'Arzobispo Chacón'], ['12-1204', 'Campo Elías'], ['12-1205', 'Guaraque'],
  ['12-1206', 'Julio César Salas'], ['12-1207', 'Justo Briceño'], ['12-1208', 'Libertador'],
  ['12-1209', 'Santos Marquina'], ['12-1210', 'Miranda'],
  ['12-1211', 'Antonio Pinto Salinas'], ['12-1212', 'Obispo Ramos de Lora'],
  ['12-1213', 'Caracciolo Parra Olmedo'], ['12-1214', 'Cardenal Quintero'],
  ['12-1215', 'Pueblo Llano'], ['12-1216', 'Rangel'], ['12-1217', 'Rivas Dávila'],
  ['12-1218', 'Sucre'], ['12-1219', 'Tovar'], ['12-1220', 'Tulio Febres Cordero'],
  ['12-1221', 'Padre Noguera'], ['12-1222', 'Aricagua'], ['12-1223', 'Zea'],
  // VE-13 Miranda
  ['13-1301', 'Acevedo'], ['13-1302', 'Brión'], ['13-1303', 'Guaicaipuro'],
  ['13-1304', 'Independencia'], ['13-1305', 'Lander'], ['13-1306', 'Páez'],
  ['13-1307', 'Paz Castillo'], ['13-1308', 'Plaza'], ['13-1309', 'Sucre'],
  ['13-1310', 'Urdaneta'], ['13-1311', 'Zamora'], ['13-1312', 'Cristóbal Rojas'],
  ['13-1313', 'Los Salias'], ['13-1314', 'Andrés Bello'], ['13-1315', 'Simón Bolívar'],
  ['13-1316', 'Baruta'], ['13-1317', 'Carrizal'], ['13-1318', 'Chacao'],
  ['13-1319', 'El Hatillo'], ['13-1320', 'Buroz'], ['13-1321', 'Pedro Gual'],
  // VE-14 Monagas
  ['14-1401', 'Acosta'], ['14-1402', 'Bolívar'], ['14-1403', 'Caripe'],
  ['14-1404', 'Cedeño'], ['14-1405', 'Ezequiel Zamora'], ['14-1406', 'Libertador'],
  ['14-1408', 'Piar'], ['14-1409', 'Punceres'], ['14-1410', 'Sotillo'],
  ['14-1411', 'Aguasay'], ['14-1412', 'Santa Bárbara'], ['14-1413', 'Uracoa'],
  ['14-140001', 'Maturín 1'], ['14-140002', 'Maturín 2'], ['14-140003', 'Maturín 3'],
  ['14-140004', 'Maturín 4'], ['14-140005', 'Maturín 5'],
  // VE-15 Nueva Esparta
  ['15-1501', 'Arismendi'], ['15-1502', 'Díaz'], ['15-1503', 'Gómez'],
  ['15-1504', 'Maneiro'], ['15-1505', 'Marcano'], ['15-1506', 'Mariño'],
  ['15-1507', 'Península de Macanao'], ['15-1508', 'Villalba (Isla de Coche)'],
  ['15-1509', 'Tubores'], ['15-1510', 'Antolín del Campo'], ['15-1511', 'García'],
  // VE-16 Portuguesa
  ['16-1601', 'Araure'], ['16-1602', 'Esteller'], ['16-1603', 'Guanare'],
  ['16-1604', 'Guanarito'], ['16-1605', 'Ospino'], ['16-1606', 'Páez'],
  ['16-1607', 'Sucre'], ['16-1608', 'Turén'], ['16-1609', 'José Vicente de Unda'],
  ['16-1610', 'Agua Blanca'], ['16-1611', 'Papelón'], ['16-1612', 'Genaro Boconoíto'],
  ['16-1613', 'San Rafael de Onoto'], ['16-1614', 'Santa Rosalía'],
  // VE-17 Sucre
  ['17-1701', 'Arismendi'], ['17-1702', 'Benítez'], ['17-1703', 'Bermúdez'],
  ['17-1704', 'Cajigal'], ['17-1705', 'Mariño'], ['17-1706', 'Mejía'],
  ['17-1707', 'Montes'], ['17-1708', 'Ribero'], ['17-1710', 'Valdez'],
  ['17-1711', 'Andrés Eloy Blanco'], ['17-1712', 'Libertador'],
  ['17-1713', 'Andrés Mata'], ['17-1714', 'Bolívar'],
  ['17-1715', 'Cruz Salmerón Acosta'], ['17-170001', 'Sucre 1'],
  ['17-170002', 'Sucre 2'], ['17-170003', 'Sucre 3'],
  // VE-18 Táchira
  ['18-1801', 'Ayacucho'], ['18-1802', 'Bolívar'], ['18-1803', 'Capacho Nuevo'],
  ['18-1804', 'Cárdenas'], ['18-1805', 'Jáuregui'], ['18-1806', 'Junín'],
  ['18-1807', 'Lobatera'], ['18-1808', 'San Cristóbal'], ['18-1809', 'Uribante'],
  ['18-1810', 'Córdoba'], ['18-1811', 'García de Hevia'], ['18-1812', 'Guásimos'],
  ['18-1813', 'Michelena'], ['18-1814', 'Libertador'], ['18-1815', 'Panamericano'],
  ['18-1816', 'Pedro María Ureña'], ['18-1817', 'Sucre'], ['18-1818', 'Andrés Bello'],
  ['18-1819', 'Fernández Feo'], ['18-1820', 'Capacho Viejo'],
  ['18-1821', 'Samuel Darío Maldonado'], ['18-1822', 'Seboruco'],
  ['18-1823', 'Antonio Rómulo Costa'], ['18-1824', 'Francisco de Miranda'],
  ['18-1825', 'José María Vargas'], ['18-1826', 'Rafael Urdaneta'],
  ['18-1827', 'Simón Rodríguez'], ['18-1828', 'Torbes'], ['18-1829', 'San Judas Tadeo'],
  // VE-19 Trujillo
  ['19-1901', 'Betijoque'], ['19-1902', 'Boconó'], ['19-1903', 'Carache'],
  ['19-1904', 'Escuque'], ['19-1905', 'Trujillo'], ['19-1906', 'Urdaneta'],
  ['19-1907', 'Valera'], ['19-1908', 'Candelaria'], ['19-1909', 'Miranda'],
  ['19-1910', 'Monte Carmelo'], ['19-1911', 'Motatán'], ['19-1912', 'Pampán'],
  ['19-1913', 'San Rafael de Carvajal'], ['19-1914', 'Sucre'],
  ['19-1915', 'Andrés Bello'], ['19-1916', 'Bolívar'],
  ['19-1917', 'José Felipe Márquez Cañizales'], ['19-1918', 'Juan Vicente Campo Elías'],
  ['19-1919', 'La Ceiba'], ['19-1920', 'Pampanito'],
  // VE-20 Yaracuy
  ['20-2001', 'Bolívar'], ['20-2002', 'Bruzual'], ['20-2003', 'Nirgua'],
  ['20-2004', 'San Felipe'], ['20-2005', 'Sucre'], ['20-2006', 'Urachiche'],
  ['20-2007', 'Peña'], ['20-2008', 'José Antonio Páez'], ['20-2009', 'La Trinidad'],
  ['20-2010', 'Cocorote'], ['20-2011', 'Independencia'],
  ['20-2012', 'Arístides Bastidas'], ['20-2013', 'Manuel Monge'], ['20-2014', 'Veroes'],
  // VE-21 Zulia
  ['21-2101', 'Baralt'], ['21-2102', 'Santa Rita'], ['21-2103', 'Colón'],
  ['21-2104', 'Mara'], ['21-2105', 'Maracaibo'], ['21-2106', 'Miranda'],
  ['21-2107', 'Indígena Bolivariano Guajira'], ['21-2108', 'Machiques de Perijá'],
  ['21-2109', 'Sucre'], ['21-2110', 'La Cañada de Urdaneta'], ['21-2111', 'Lagunillas'],
  ['21-2112', 'Catatumbo'], ['21-2113', 'Rosario de Perijá'], ['21-2114', 'Cabimas'],
  ['21-2115', 'Valmore Rodríguez'], ['21-2116', 'Jesús Enrique Lossada'],
  ['21-2117', 'Almirante Padilla'], ['21-2118', 'San Francisco'],
  ['21-2119', 'Jesús María Semprún'], ['21-2120', 'Francisco Javier Pulgar'],
  ['21-2121', 'Simón Bolívar'],
  // VE-22 Amazonas
  ['22-2201', 'Atures'], ['22-2202', 'Atabapo'], ['22-2203', 'Maroa'],
  ['22-2204', 'Río Negro'], ['22-2205', 'Autana'], ['22-2206', 'Manapiare'],
  ['22-2207', 'Alto Orinoco'],
  // VE-23 Delta Amacuro
  ['23-2301', 'Tucupita'], ['23-2302', 'Pedernales'], ['23-2303', 'Antonio Díaz'],
  ['23-2304', 'Casacoima'],
  // VE-24 La Guaira
  ['24-240101', 'Caraballeda'], ['24-240102', 'Carayaca'], ['24-240103', 'Caruao'],
  ['24-240104', 'Catia La Mar'], ['24-240105', 'La Guaira'], ['24-240106', 'Macuto'],
  ['24-240107', 'Maiquetía'], ['24-240108', 'Naiguatá'], ['24-240109', 'El Junko'],
  ['24-240110', 'Urimare'], ['24-240111', 'Carlos Soublette'],
];

// ---------------------------------------------------------------------------
// Derived lookups (built once at module load)
// ---------------------------------------------------------------------------

/** Municipality code → label. */
const municipalityByCode = new Map<string, string>(MUNICIPALITY_DATA);

/** Full municipality list with resolved state labels. */
export const VE_MUNICIPALITIES: Municipality[] = MUNICIPALITY_DATA.map(
  ([code, label]) => {
    const sc = code.slice(0, 2);
    const state = stateByCode.get(sc);
    return { code, label, stateCode: sc, stateLabel: state?.label ?? '' };
  },
);

// ---------------------------------------------------------------------------
// Structural code parsing
// ---------------------------------------------------------------------------

/** Regex matching a municipality code: NN-NNN… (3–6 digit suffix, purely numeric) */
const MUNICIPALITY_RE = /^\d{2}-\d{3,6}$/;

/** Regex matching any territorial code (municipality or child). */
const TERRITORIAL_CODE_RE = /^\d{2}-\d{3,6}(?:-\d{3,6})?[a-z]?$/;

/** Regex matching a state code: NN */
const STATE_RE = /^\d{2}$/;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Given a hashtag code, return the parent state code ("13").
 * Handles municipality codes ("13-1316") and state codes ("13").
 */
export function getStateCodeForHashtag(hashtag: string): string | undefined {
  // Already a state code?
  if (STATE_RE.test(hashtag) && stateByCode.has(hashtag)) return hashtag;
  // Structural extraction from municipality/child code
  if (!TERRITORIAL_CODE_RE.test(hashtag)) return undefined;
  const seg = hashtag.split('-')[0];
  return STATE_RE.test(seg) && stateByCode.has(seg) ? seg : undefined;
}

/** Look up a state by its code. */
export function getStateByCode(code: string): TerritorialState | undefined {
  return stateByCode.get(code);
}

/** Format a territorial code for display (uppercase). */
export function displayCode(code: string): string {
  return code.toUpperCase();
}

/** Look up a municipality label by its code. */
export function getMunicipalityLabel(code: string): string | undefined {
  return municipalityByCode.get(code);
}

/** Check whether a string is a valid municipality code format. */
export function isMunicipalityCode(value: string): boolean {
  return MUNICIPALITY_RE.test(value);
}

/** Check whether a string is a valid state code format. */
export function isStateCode(value: string): boolean {
  return STATE_RE.test(value);
}

/** Get all municipalities for a given state code. */
export function getAllMunicipalitiesForState(stateCode: string): Municipality[] {
  return VE_MUNICIPALITIES.filter((m) => m.stateCode === stateCode);
}
