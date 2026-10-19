# Emphasis fixtures

## Standard forms (all should style)
*italic*
_italic_
**bold**
__bold__
***both bold and italic***
___both bold and italic___

## Nested strong containing italic (should nest)
**foo *bar* baz**

## Intraword underscores — MUST stay literal (snake_case protection)
MAX_BG_TASKS_PER_SESSION
foo_bar_baz
a__b__c
__foo__bar
foo_bar_
_foo_bar
_пристаням_стремятся

## Intraword asterisks — MUST emphasize (CommonMark flanking)
a*b*c
foo*bar*baz
foo**bar**baz

## Underscore spans inert inner runs (should style across them)
_foo_bar_baz_
