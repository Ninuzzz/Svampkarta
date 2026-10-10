/** Hemorten som kartan utgår från. Ändra här för att flytta appens startpunkt. */
export const HOME = {
  name: 'Landskrona',
  lat: 55.8708,
  lng: 12.8302,
  zoom: 12,
  /**
   * Kartans startvy på smal skärm (mobil), när bara hemkommunen är vald. Med punkten och zoomen
   * ovan ser man där mest hav och en enda topp: staden ligger vid kusten och kommunens skog inåt
   * land. Den här vyn är ett zoomsteg längre ut och förskjuten österut, så att kommunens land
   * ryms. Fast vy med flit – att rama in kommungränsen (som går långt ut i Öresund) eller de
   * bästa topparna automatiskt provades 2026-10-10 och gav sämre eller tomma vyer.
   */
  narrow: { lat: 55.865, lng: 12.938, zoom: 11 },
  /** kommunen som analyseras från start (kommunkod) */
  kommun: '1282',
  /** område som platssökningen prioriterar (väst, nord, öst, syd) */
  searchBox: [12.45, 56.1, 13.35, 55.65] as const,
}
