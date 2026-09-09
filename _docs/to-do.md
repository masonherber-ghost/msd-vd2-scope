Filters:
- ~~Show a filters icon button - this will open the filters as a column.~~ done
- ~~By default it is hidden~~ done — the button carries a count of active filter
  groups so a filtered view never looks unfiltered, and the zero-result state
  offers to reveal the rail.
- ~~remove source filter~~ reverted — see below.
- ~~Add source filter back~~ done — PRD R-8.8 amended again.
- ~~MVP feature filter lookup - collapse into a search field until some string is
  added, then show the list as results~~ done — a selected ref stays visible while
  collapsed so an active filter is never hidden.

Navigation:
- ~~Remove contact and 404 pages from the nav and any routes~~ done — the catch-all
  route still renders NotFound for any unknown URL, covered by src/routes/routes.test.tsx.
