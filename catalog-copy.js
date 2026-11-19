'use strict';

const GENERIC_DESCRIPTION = 'Kit de peinture créative à tracer et à peindre';
const GENERIC_ENGLISH = new Set([
  'Creative Trace-and-Paint Kit',
  'Creative paintng kit-Trace and Paint'
]);

const ARTWORK_COPY = {
  'Tournesol à la fenêtre': {
    fr: ['Peignez un tournesol en pot devant une fenêtre bleue. Le croquis à transférer et le tutoriel vous accompagnent du premier trait aux derniers reflets.', 'Tournesol jaune en pot devant une fenêtre bleue'],
    en: ['Paint a potted sunflower against a blue window. The transfer sketch and tutorial guide you from the first outline to the last highlights.', 'Yellow sunflower in a pot beside a blue window']
  },
  'Nuit de Noël': {
    fr: ['Un sapin illuminé et une chapelle dans la neige. Sortez les pinceaux pour une soirée de Noël à la maison et suivez le tutoriel à votre rythme.', 'Sapin de Noël illuminé et chapelle dans la neige'],
    en: ['Paint a glowing Christmas tree and a chapel on a snowy night. Set out your brushes for a holiday evening at home and follow the tutorial at your own pace.', 'Lit Christmas tree and chapel in the snow']
  },
  'Pivoine blanche': {
    fr: ['Peignez un bouquet de pivoines blanches sur un fond vert. Le croquis et le tutoriel vous guident, même si c’est votre première toile.', 'Bouquet de pivoines blanches dans un vase sur fond vert'],
    en: ['Paint a vase of white peonies against a soft green background. The sketch and tutorial will guide you, even if it’s your first canvas.', 'White peonies in a vase against a green background']
  },
  'Été doré': {
    fr: ['Tracez le profil d’une femme au chapeau de paille, puis peignez son bouquet de marguerites et les tons dorés de la scène.', 'Femme au chapeau de paille tenant un bouquet de marguerites'],
    en: ['Trace the profile of a woman in a straw hat, then paint her bunch of daisies and the warm gold tones around her.', 'Woman in a straw hat holding a bunch of daisies']
  },
  'Fleurs abstraites': {
    fr: ['Un vase orange, des fleurs éclatantes et des touches de violet. Le croquis donne la forme du bouquet, et vous pouvez jouer avec les couleurs au fil du tutoriel.', 'Bouquet abstrait multicolore dans un vase orange'],
    en: ['An orange vase, bright flowers and a splash of purple. Use the sketch to lay out the bouquet, then play with the colours as you follow the tutorial.', 'Colourful abstract bouquet in an orange vase']
  },
  'Matin bleu en Grèce': {
    fr: ['Peignez une terrasse au soleil, avec une porte bleue, des bougainvilliers et la mer au loin. Le tutoriel vous guide à travers les couleurs de ce paysage grec.', 'Terrasse grecque avec une porte bleue, des fleurs et la mer'],
    en: ['Paint a sunlit terrace with a blue door, bougainvillea and the sea beyond. Follow the tutorial to build up the colours of this Greek coastal scene.', 'Greek terrace with a blue door, flowers and a sea view']
  }
};

function withCatalogCopy(product) {
  if (!Object.hasOwn(ARTWORK_COPY, product.name)) return product;
  const { fr, en } = ARTWORK_COPY[product.name];
  const english = product.translations?.en || {};
  const useDefaultCopy = product.description?.trim() === GENERIC_DESCRIPTION;
  return {
    ...product,
    description: useDefaultCopy ? fr[0] : product.description,
    imageAlt: product.imageAlt || fr[1],
    translations: {
      ...product.translations,
      en: {
        ...english,
        ...(useDefaultCopy && (!english.description || GENERIC_ENGLISH.has(english.description.trim())) ? { description:en[0] } : {}),
        imageAlt: english.imageAlt || (product.imageAlt ? '' : en[1])
      }
    }
  };
}

module.exports = { withCatalogCopy };
