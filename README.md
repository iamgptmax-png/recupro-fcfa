# ReçuPro FCFA — Reçus WhatsApp & Carnet de Crédit

Application web mobile (PWA hors-ligne) conçue pour les commerçants, vendeurs WhatsApp, livreurs et prestataires en Afrique francophone.

## Fonctionnalités
- **Reçus professionnels en 10 secondes** : rendu image HD (PNG) prêt pour WhatsApp + impression PDF.
- **Devises & Mobile Money** : FCFA (XOF/XAF), GNF, MAD, TND, CDF, EUR ; paiements Wave, Orange Money, MTN MoMo, Moov Money, Espèces, Virement.
- **Carnet de Crédit intégré** : suivi des acomptes et impayés + bouton **Relancer sur WhatsApp** pré-rempli avec votre numéro Mobile Money.
- **100 % hors-ligne & gratuit à héberger** : aucune base de données ni serveur payant.

## Comment encaisser vos ventes Pro (5 000 FCFA)
1. Créez un produit numérique à **5 000 FCFA** sur **Chariow**, **Maketou**, **FedaPay** ou **CinetPay** (paiement par Wave, Orange Money, MTN MoMo).
2. Ouvrez `app.js` et remplacez `PRO_PAYMENT_URL` (ligne 4) par votre lien de paiement.
3. Après paiement d'un client, envoyez-lui une clé d'activation valide :
   - Clé de test immédiate : `RECUPRO-PRO-2026`
   - Pour générer une clé unique par client : prenez 4 caractères alphanumériques majuscules `XXXX`, calculez `sum(ord(c)*(i+3) for i,c in enumerate(XXXX)) % 97` sur 2 chiffres `YY`, puis donnez `RECUPRO-XXXX-YY`.
