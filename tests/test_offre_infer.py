import unittest

from backend.services.offre_infer import infer_entreprise_from_annonce


class TestOffreInfer(unittest.TestCase):
    def test_empty(self):
        self.assertEqual(infer_entreprise_from_annonce(""), ("", 0.0))
        self.assertEqual(infer_entreprise_from_annonce("   "), ("", 0.0))

    def test_label_entreprise(self):
        name, conf = infer_entreprise_from_annonce("Entreprise : Acme Corp\n\nDescription du poste")
        self.assertEqual(name, "Acme Corp")
        self.assertGreaterEqual(conf, 0.9)

    def test_recrute(self):
        text = "Banque Demo recrute un analyste risque pour son siège.\n\nMissions :"
        name, conf = infer_entreprise_from_annonce(text)
        self.assertEqual(name, "Banque Demo")
        self.assertGreaterEqual(conf, 0.8)

    def test_chez(self):
        text = "Rejoignez une équipe dynamique chez StartUp42 pour un stage 6 mois."
        name, conf = infer_entreprise_from_annonce(text)
        self.assertEqual(name, "StartUp42")
        self.assertGreaterEqual(conf, 0.65)

    def test_title_separator(self):
        text = "Ingénieur data — BigCorp Industries"
        name, conf = infer_entreprise_from_annonce(text)
        self.assertEqual(name, "BigCorp Industries")
        self.assertLess(conf, 0.7)

    def test_sfil_tagline_not_company(self):
        """Baseline « grand groupe / taille humaine » ne doit pas passer pour le nom ; viser Sfil."""
        text = """
LA FORCE D'UN GRAND GROUPE DANS UNE ENTREPRISE A TAILLE HUMAINE

Vous souhaitez contribuer à une mission unique d'utilité publique ? Rejoignez-nous !

Travailler chez Sfil, c'est contribuer au rayonnement d'une banque publique de développement à taille humaine (400 collaborateurs).
""".strip()
        name, conf = infer_entreprise_from_annonce(text)
        self.assertEqual(name, "Sfil")
        self.assertGreaterEqual(conf, 0.85)


if __name__ == "__main__":
    unittest.main()
