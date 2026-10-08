/** Hemorten som kartan utgår från. Ändra här för att flytta appens startpunkt. */
export const HOME = {
  name: 'Landskrona',
  lat: 55.8708,
  lng: 12.8302,
  zoom: 12,
  /** kommunen som analyseras från start (kommunkod) */
  kommun: '1282',
  /** område som platssökningen prioriterar (väst, nord, öst, syd) */
  searchBox: [12.45, 56.1, 13.35, 55.65] as const,
}
