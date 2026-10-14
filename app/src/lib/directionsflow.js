// Itinéraire : départ, arrivée, étapes, calcul et choix du mode.
// Code sorti de +page.svelte : il lit et modifie l'état de l'écran par l'objet « app » (bloc « app » de la page).
import { empty } from '#lib/maplayers.js';
import { streetRoute, trafficEstimate, transitRoutes, transitWithStop } from '#lib/routing.js';
import { tick } from 'svelte';

/** @param {any} app */
export function createDirections(app) {
  // ——— Itinéraire ———
  async function startDirections() {
    app.directions = true;
    app.dimPlaces(true);
    app.to = { label: app.place.name, lat: app.place.lat, lon: app.place.lon };
    app.clearSelection();
    app.placeMarker(app.to.lon, app.to.lat);
    app.via = null;
    app.showVia = false;
    app.routes = { walk: null, bike: null, transit: null };
    app.picked = 0;
    try {
      app.from = app.me || (await app.getPosition());
      const d = app.dist(app.from.lat, app.from.lon, app.to.lat, app.to.lon);
      app.mode = d > 2500 ? 'transit' : 'walk';
      computeRoutes();
    } catch {
      app.from = null;
      editField('from');
    }
  }
  function closeDirections() {
    app.directions = false;
    app.dimPlaces(false);
    app.editing = null;
    app.routeCtrl?.abort();
    app.routes = { walk: null, bike: null, transit: null };
    app.map.getSource('route')?.setData(empty());
    app.map.getSource('route-ends')?.setData(empty());
    app.map.getSource('route-tags')?.setData(empty());
    if (app.place) { app.showSelection(app.place); app.frame(app.place.lon, app.place.lat); }
  }
  const pointOf = (which) => ({ from: app.from, via: app.via, to: app.to })[which];
  function setPoint(which, pt) {
    if (which === 'from') app.from = pt;
    else if (which === 'via') app.via = pt;
    else app.to = pt;
  }
  function addStop() {
    app.showVia = true;
    editField('via');
  }
  function removeStop() {
    app.showVia = false;
    app.via = null;
    if (app.editing === 'via') app.editing = null;
    computeRoutes();
  }
  async function editField(which) {
    app.editing = which;
    app.fieldQuery = '';
    app.results = [];
    await tick();
    app.fieldEl?.focus();
  }
  function useMyPosition() {
    app.editing = null;
    app.getPosition().then((p) => { app.from = p; computeRoutes(); })
      .catch((e) => app.say(`${app.locError(e)} En attendant, choisissez un point de départ.`));
  }
  function swap() {
    [app.from, app.to] = [app.to, app.from];
    if (app.to) app.placeMarker(app.to.lon, app.to.lat);
    computeRoutes();
  }
  function computeRoutes() {
    app.routeCtrl?.abort();
    if (!app.from || !app.to || (app.showVia && !app.via)) return;
    app.routeCtrl = new AbortController();
    const signal = app.routeCtrl.signal;
    app.picked = 0;
    app.pickedStreet = 0;
    app.routes = { walk: { status: 'loading' }, bike: { status: 'loading' }, transit: { status: 'loading' }, car: { status: 'loading' } };
    const run = async (id, fn) => {
      try {
        const data = await fn();
        if (signal.aborted) return;
        app.routes[id] = (Array.isArray(data) && !data.length) ? { status: 'none' } : { status: 'ok', data };
      } catch (e) {
        if (e.name === 'AbortError') return;
        app.routes[id] = { status: e.message === 'no-route' ? 'none' : 'error' };
      }
      if (id === app.mode) app.drawRoute();
    };
    const v = app.showVia ? app.via : null;
    run('walk', () => streetRoute(app.from, app.to, 'walk', signal, v));
    run('bike', () => streetRoute(app.from, app.to, 'bike', signal, v));
    run('transit', () => (v ? transitWithStop(app.from, v, app.to, signal) : transitRoutes(app.from, app.to, signal)));
    run('car', async () => {
      const r = await streetRoute(app.from, app.to, 'car', signal, v);
      const t = await trafficEstimate(app.from, app.to);
      const withTraffic = (x) => ({ ...x, freeDuration: x.duration, duration: x.duration * t.factor, traffic: t.label });
      return { ...withTraffic(r), alts: r.alts.map(withTraffic) };
    });
  }
  function chooseMode(m) {
    app.mode = m;
    app.picked = 0;
    app.pickedStreet = 0;
    app.showSteps = false;
    app.drawRoute();
  }
  // Choisir un autre itinéraire : son résumé remonte en tête de fiche.
  const sheetToTop = () => document.querySelector('.route-sheet')?.scrollTo({ top: 0, behavior: 'smooth' });
  function pickStreet(i) {
    app.pickedStreet = i;
    app.drawRoute(false);
    sheetToTop();
  }
  function pickTransit(i) {
    app.picked = i;
    app.drawRoute();
    sheetToTop();
  }

  return { startDirections, closeDirections, pointOf, setPoint, addStop, removeStop, editField, useMyPosition, swap, computeRoutes, chooseMode, sheetToTop, pickStreet, pickTransit };
}
