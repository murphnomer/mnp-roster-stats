// Adds Points and POPS columns to the team roster page of a Monday Night Pinball match.
// Shared by the browser extension and the userscript (see build.mjs).

(function () {
  'use strict';

  // Points available to each player in one game, by round.
  // Rounds 1 and 4 are doubles (2.5 per player), rounds 2 and 3 are singles (3).
  var MAX_POINTS = { 1: 2.5, 2: 3, 3: 3, 4: 2.5 };

  var m = location.pathname.match(/^\/matches\/([^/]+)\/(home|away)\/?$/);
  if (!m) return;
  var matchKey = m[1];

  // The roster table is the one whose header row has a "Games" column.
  var rosterTable = Array.prototype.find.call(document.querySelectorAll('table'), function (t) {
    var hdr = t.querySelector('tr.header-row');
    return hdr && /\bGames\b/.test(hdr.textContent);
  });
  // Already added (e.g. the bookmarklet was tapped twice).
  if (!rosterTable || rosterTable.hasAttribute('data-mnp-stats')) return;
  rosterTable.setAttribute('data-mnp-stats', '');

  var headerRow = rosterTable.querySelector('tr.header-row');
  var gamesCol = Array.prototype.findIndex.call(headerRow.cells, function (c) {
    return c.textContent.trim() === 'Games';
  });
  var playerRows = Array.prototype.filter.call(rosterTable.rows, function (r) {
    return r !== headerRow && r.cells.length > gamesCol;
  });

  // Each round page embeds `var games = [...]` and `var labels = {...}` as JSON on one line.
  function extractVar(html, name) {
    var re = new RegExp('var ' + name + ' = (.*);\\s*$', 'm');
    var hit = html.match(re);
    return hit ? JSON.parse(hit[1]) : null;
  }

  // Asking for a round that hasn't started returns the latest round instead (mid-match, ?round=4
  // can be round 1), so trust the page's own "Round: N" heading, not the number we asked for.
  function fetchRound(n) {
    return fetch(location.origin + '/matches/' + matchKey + '?round=' + n, { credentials: 'same-origin' })
      .then(function (r) { return r.text(); })
      .then(function (html) {
        var shown = html.match(/<b>Round:\s*(\d+)\s*<\/b>/);
        return {
          round: shown ? Number(shown[1]) : null,
          games: extractVar(html, 'games') || [],
          labels: extractVar(html, 'labels') || {}
        };
      });
  }

  function normName(s) {
    return s.replace(/\(SUB\)/i, '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function fmtPoints(v) {
    return (Math.round(v * 10) / 10).toString();
  }

  // POPS as a decimal to three significant digits, e.g. 0.938, 0.750, 1.00.
  function fmtPops(points, available) {
    return (points / available).toPrecision(3);
  }

  function addCells(row, a, b, tag) {
    var ref = row.cells[gamesCol].nextSibling;
    [a, b].forEach(function (text) {
      var td = document.createElement(tag || 'td');
      td.className = 'text-xs-center';
      td.textContent = text;
      row.insertBefore(td, ref);
    });
  }

  addCells(headerRow, 'Points', 'POPS');
  playerRows.forEach(function (r) { addCells(r, '…', ''); });

  // Returned so the loader (bookmarklet, iOS Shortcut) can tell when the columns are filled in.
  return Promise.all([1, 2, 3, 4].map(fetchRound)).then(function (rounds) {
    // name -> { points, available, games }
    var stats = {};
    var counted = {};
    rounds.forEach(function (rd) {
      var max = MAX_POINTS[rd.round];
      // Skip pages that are a repeat of a round already counted, or that aren't a round at all.
      if (!max || counted[rd.round]) return;
      counted[rd.round] = true;
      rd.games.forEach(function (g) {
        if (!g.done) return;
        for (var p = 1; p <= 4; p++) {
          var id = g['player_' + p];
          if (!id) continue;
          var name = normName(rd.labels[id] || id);
          var s = stats[name] || (stats[name] = { points: 0, available: 0, games: 0 });
          s.points += Number(g['points_' + p]) || 0;
          s.available += max;
          s.games += 1;
        }
      });
    });

    var teamPts = 0, teamAvail = 0;
    playerRows.forEach(function (r) {
      var name = normName(r.cells[gamesCol - 1].textContent);
      var s = stats[name];
      var ptsCell = r.cells[gamesCol + 1], popsCell = r.cells[gamesCol + 2];
      if (!s || !s.available) {
        ptsCell.textContent = '0';
        popsCell.textContent = '–';
        return;
      }
      teamPts += s.points;
      teamAvail += s.available;
      ptsCell.textContent = fmtPoints(s.points);
      popsCell.textContent = fmtPops(s.points, s.available);
      popsCell.title = fmtPoints(s.points) + ' of ' + fmtPoints(s.available) + ' available in ' + s.games + ' completed games';
    });

    // Team total row.
    if (teamAvail) {
      var tr = document.createElement('tr');
      tr.style.fontWeight = 'bold';
      for (var i = 0; i < headerRow.cells.length; i++) tr.appendChild(document.createElement('td'));
      tr.cells[gamesCol - 1].textContent = 'Team';
      tr.cells[gamesCol + 1].textContent = fmtPoints(teamPts);
      tr.cells[gamesCol + 1].className = 'text-xs-center';
      tr.cells[gamesCol + 2].textContent = fmtPops(teamPts, teamAvail);
      tr.cells[gamesCol + 2].className = 'text-xs-center';
      playerRows[playerRows.length - 1].parentNode.appendChild(tr);
    }
  }).catch(function (err) {
    console.error('[MNP Roster Stats]', err);
    playerRows.forEach(function (r) { r.cells[gamesCol + 1].textContent = '?'; });
  });
})();
