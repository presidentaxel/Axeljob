"""Version semantique du scoring ATS.

A incrementer **a chaque** changement de ponderation ou de regle qui modifie
les scores produits. Permet de :

- traquer les regressions (fixtures snapshot par version) ;
- recalibrer en s'assurant que les scores historiques restent reproductibles.

Format : ``YYYY.MM`` ou ``YYYY.MM.patch`` pour les corrections mineures.
"""

SCORING_VERSION = "2026.05.2"
