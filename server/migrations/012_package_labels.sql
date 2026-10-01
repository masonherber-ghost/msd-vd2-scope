-- "Release" becomes "Package" in the labels people read.
--
-- The word was only ever a label. Ids ('1.1', '1.4', '2+'), columns and the
-- two source documents are untouched — the parsers still read headings that
-- say "Release", because that is what the sources say. What changes is the
-- label the parsers *write*, and this brings rows imported before that change
-- into line, so the chips and the row headers do not read "Release 1.1" on a
-- database that has not been re-imported since.
--
-- Only the leading word is rewritten: "Release 1.1" -> "Package 1.1". A label
-- someone typed by hand that happens to contain the word elsewhere is left
-- alone, and re-running this changes nothing, because a label already
-- starting "Package " no longer matches.
UPDATE releases
   SET label = 'Package ' || substr(label, length('Release ') + 1),
       updated_at = datetime('now')
 WHERE label LIKE 'Release %';
