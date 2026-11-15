"""Crew Health Check: naming, grouping and metadata rules (single source of truth).

Maps Z-Anatomy source objects to stable CHC object names. A rule is
(target_template, name_regex, path_regex); the first match wins, target None = drop.
`{S}` in a template becomes `_L` / `_R` (the subject's own left / right) or ``.
"""
import re

ASSET_VERSION = "1.0.0"
REFERENCE_HEIGHT_M = 1.75

COLLECTIONS = [
    "01_EXTERNAL_BODY", "02_SKELETAL_SYSTEM", "03_MUSCULAR_SYSTEM", "04_CARDIOVASCULAR_SYSTEM",
    "05_RESPIRATORY_SYSTEM", "06_NERVOUS_SYSTEM", "07_DIGESTIVE_SYSTEM", "08_URINARY_SYSTEM",
    "09_ENDOCRINE_SYSTEM", "10_LYMPHATIC_SYSTEM", "11_REPRODUCTIVE_OPTIONAL", "12_SENSOR_ANCHORS",
    "13_BODY_REGIONS", "14_RIG_AND_ARMATURE", "15_VISUALIZATION_HELPERS", "16_REFERENCE_OBJECTS",
    "17_PREVIEW_LIGHTS_AND_CAMERAS",
]
# system key -> (collection, system group empty)
SYSTEMS = {
    "external": ("01_EXTERNAL_BODY", "SYSTEM_ExternalBody"),
    "skeletal": ("02_SKELETAL_SYSTEM", "SYSTEM_Skeletal"),
    "muscular": ("03_MUSCULAR_SYSTEM", "SYSTEM_Muscular"),
    "cardiovascular": ("04_CARDIOVASCULAR_SYSTEM", "SYSTEM_Cardiovascular"),
    "respiratory": ("05_RESPIRATORY_SYSTEM", "SYSTEM_Respiratory"),
    "nervous": ("06_NERVOUS_SYSTEM", "SYSTEM_Nervous"),
    "digestive": ("07_DIGESTIVE_SYSTEM", "SYSTEM_Digestive"),
    "urinary": ("08_URINARY_SYSTEM", "SYSTEM_Urinary"),
    "endocrine": ("09_ENDOCRINE_SYSTEM", "SYSTEM_Endocrine"),
    "lymphatic": ("10_LYMPHATIC_SYSTEM", "SYSTEM_Lymphatic"),
}
ROOT_NAME = "ROOT_CrewHealthCheck"

# name: (r, g, b, alpha, roughness)   Principled BSDF only, nothing baked in.
MATERIALS = {
    "MAT_Body_Base": (0.78, 0.80, 0.83, 1.0, 0.45),
    "MAT_Skin_Inspection": (0.78, 0.80, 0.83, 0.22, 0.45),
    "MAT_Region_Highlight": (1.00, 0.55, 0.10, 0.55, 0.60),
    "MAT_Skeleton_Base": (0.89, 0.86, 0.76, 1.0, 0.55),
    "MAT_Skeleton_Cartilage": (0.72, 0.83, 0.87, 1.0, 0.50),
    "MAT_Muscular_Base": (0.62, 0.20, 0.17, 1.0, 0.50),
    "MAT_Cardiovascular_Base": (0.70, 0.16, 0.16, 1.0, 0.45),
    "MAT_Cardiovascular_Artery": (0.82, 0.10, 0.10, 1.0, 0.40),
    "MAT_Cardiovascular_Vein": (0.16, 0.28, 0.72, 1.0, 0.40),
    "MAT_Respiratory_Base": (0.86, 0.60, 0.60, 1.0, 0.55),
    "MAT_Respiratory_Airway": (0.78, 0.82, 0.92, 1.0, 0.50),
    "MAT_Nervous_Base": (0.87, 0.72, 0.68, 1.0, 0.55),
    "MAT_Nervous_Nerve": (0.93, 0.80, 0.25, 1.0, 0.50),
    "MAT_Organ_Base": (0.80, 0.55, 0.50, 1.0, 0.50),
    "MAT_Organ_Liver": (0.50, 0.20, 0.14, 1.0, 0.45),
    "MAT_Organ_Stomach": (0.85, 0.60, 0.55, 1.0, 0.50),
    "MAT_Organ_Intestine": (0.87, 0.67, 0.55, 1.0, 0.50),
    "MAT_Organ_Pancreas": (0.90, 0.78, 0.50, 1.0, 0.50),
    "MAT_Organ_Gallbladder": (0.35, 0.55, 0.25, 1.0, 0.45),
    "MAT_Organ_Kidney": (0.55, 0.25, 0.20, 1.0, 0.45),
    "MAT_Organ_Bladder": (0.85, 0.75, 0.45, 1.0, 0.50),
    "MAT_Organ_Spleen": (0.45, 0.18, 0.30, 1.0, 0.45),
    "MAT_Endocrine_Base": (0.72, 0.48, 0.85, 1.0, 0.50),
    "MAT_Lymphatic_Base": (0.45, 0.75, 0.45, 1.0, 0.50),
}

ORD = {"First": 1, "Second": 2, "Third": 3, "Fourth": 4, "Fifth": 5, "Sixth": 6, "Seventh": 7,
       "Eighth": 8, "Ninth": 9, "Tenth": 10, "Eleventh": 11, "Twelfth": 12}

def R(target, name=None, path=None):
    return (target, re.compile(name, re.I) if name else None, re.compile(path, re.I) if path else None)

DROP = None
RULES = {}

RULES["1: Skeletal system"] = [
    R("BONE_Cranium", r"^(Frontal|Occipital|Sphenoid|Ethmoid|Parietal|Temporal|Zygomatic|Nasal|Lacrimal|Palatine) bone$|^Maxilla$|^Vomer$|^Inferior nasal concha bone$"),
    R("BONE_Mandible", r"^Mandible$"),
    R("BONE_Teeth_Upper", r"^Upper .*(incisor|canine|premolar|molar)"),
    R("BONE_Teeth_Lower", r"^Lower .*(incisor|canine|premolar|molar)"),
    R("BONE_Hyoid", r"^Hyoid bone$"),
    R("BONE_Vertebra_C1", r"^Atlas"), R("BONE_Vertebra_C2", r"^Axis"),
    R("BONE_Vertebra_{1}", r"^Vertebra ([CTL]\d+)$"),
    R("BONE_Sacrum", r"^Sacrum$"), R("BONE_Coccyx", r"^Coccyx$"),
    R("BONE_Sternum", r"^(Manubrium of sternum|Body of sternum|Xiphoid process)$"),
    R("BONE_Rib_{ORD}{S}", r"^(\w+) rib$"),
    R("BONE_CostalCartilages{S}", r"^Costal cartilage"),
    R("BONE_Clavicle{S}", r"^Clavicle$"), R("BONE_Scapula{S}", r"^Scapula$"),
    R("BONE_Humerus{S}", r"^Humerus$"), R("BONE_Radius{S}", r"^Radius$"), R("BONE_Ulna{S}", r"^Ulna$"),
    R("BONE_Carpals{S}", r"^(Scaphoid|Lunate|Triquetrum|Pisiform|Trapezium|Trapezoid|Capitate|Hamate) bone$"),
    R("BONE_Metacarpals{S}", r"metacarpal bone$"),
    R("BONE_Phalanges_Hand{S}", r"phalanx of .* finger of hand$"),
    R("BONE_Hip{S}", r"^Hip bone$"), R("BONE_Femur{S}", r"^Femur$"), R("BONE_Patella{S}", r"^Patella$"),
    R("BONE_Tibia{S}", r"^Tibia$"), R("BONE_Fibula{S}", r"^Fibula$"),
    R("BONE_Tarsals{S}", r"^(Calcaneus|Talus|Navicular bone|Cuboid bone|(Medial|Intermediate|Lateral) cuneiform bone)$"),
    R("BONE_Metatarsals{S}", r"metatarsal bone$|^Sesamoid bones of foot$"),
    R("BONE_Phalanges_Foot{S}", r"phalanx of .* finger of foot$"),
    R("SYS_Larynx", r"^(Thyroid|Cricoid|Arytenoid|Corniculate) cartilage$"),
]
RULES["3: Joints"] = [R("BONE_IntervertebralDiscs", r"^Intervertebral disc")]

M = "MUSCLE_"
RULES["4: Muscular system"] = [
    R(M + "Facial{S}", r"^Epicranial aponeurosis$"),
    R(M + "TensorFasciaeLatae{S}", r"^Tensor fasciae latae$|^Iliotibial tract$"),
    R(DROP, r"fascia|bursa|sheath|retinaculum|septum|ligament|aponeurosis|membrane|tendinous|trochlea|tarsus|arch\b"),
    R(M + "PectoralisMajor{S}", r"pectoralis major"),
    R(M + "PectoralisMinor{S}", r"^Pectoralis minor|^Subclavius"),
    R(M + "SerratusAnterior{S}", r"^Serratus anterior"),
    R(M + "RectusAbdominis{S}", r"^Rectus abdominis|^Pyramidalis"),
    R(M + "ExternalOblique{S}", r"^External abdominal oblique"),
    R(M + "InternalOblique{S}", r"^Internal abdominal oblique"),
    R(M + "TransversusAbdominis{S}", r"^Transversus abdominis"),
    R(M + "Intercostals{S}", r"intercostal muscles$|^Transversus thoracis|^Levatores (breves|longi) costarum"),
    R(M + "LatissimusDorsi{S}", r"^Latissimus dorsi"),
    R(M + "Trapezius{S}", r"part of trapezius"),
    R(M + "Rhomboids{S}", r"^Rhomboid"),
    R(M + "LevatorScapulae{S}", r"^Levator scapulae"),
    R(M + "ErectorSpinae_Iliocostalis{S}", r"^Iliocostalis"),
    R(M + "ErectorSpinae_Longissimus{S}", r"^Longissimus"),
    R(M + "ErectorSpinae_Spinalis{S}", r"^Spinalis"),
    R(M + "Transversospinales{S}", r"^Multifidus|^Semispinalis|^Rotatores|^Interspinales|intertransversarii"),
    R(M + "Splenius{S}", r"^Splenius"),
    R(M + "Suboccipitals{S}", r"^Rectus posterior (major|minor) capitis|^Obliquus (inferior|superior) capitis"),
    R(M + "SerratusPosterior{S}", r"^Serratus posterior"),
    R(M + "QuadratusLumborum{S}", r"^Quadratus lumborum"),
    R(M + "Iliopsoas{S}", r"^Psoas major|^Iliacus muscle"),
    R(M + "Diaphragm", r"^Diaphragm$"),
    R(M + "PelvicFloor{S}", r"^Iliococcygeus|^Pubococcygeus|^Pubo-analis|^Coccygeus|^External anal sphincter"),
    R(M + "Sternocleidomastoid{S}", r"^Sternocleidomastoid"),
    R(M + "Scalenes{S}", r"^Scalenus"),
    R(M + "Infrahyoid{S}", r"^(Sternohyoid|Sternothyroid|Thyrohyoid|Omohyoid) muscle"),
    R(M + "Suprahyoid{S}", r"digastric muscle|^Mylohyoid|^Geniohyoid|^Stylohyoid"),
    R(M + "Prevertebral{S}", r"^Longus (capitis|colli)|^Rectus (anterior|lateralis) capitis"),
    R(M + "Masseter{S}", r"part of masseter"),
    R(M + "Temporalis{S}", r"^Temporalis muscle"),
    R(M + "Pterygoids{S}", r"pterygoid muscle"),
    R(M + "Facial{S}", r"^(Frontalis|Occipitalis|Temporoparietalis|Mentalis|Nasalis|Procerus|Risorius) muscle|orbicularis oculi|^Orbicularis oris|^Zygomaticus|^Levator (labii|nasolabialis|anguli)|^Depressor|^Corrugator|^Bucinator"),
    R(M + "Deltoid{S}", r"part of deltoid muscle"),
    R(M + "RotatorCuff{S}", r"^(Supraspinatus|Infraspinatus|Subscapularis|Teres minor) muscle"),
    R(M + "TeresMajor{S}", r"^Teres major muscle"),
    R(M + "Biceps{S}", r"head of biceps brachii"),
    R(M + "Brachialis{S}", r"^Brachialis muscle|^Coracobrachialis muscle"),
    R(M + "Triceps{S}", r"head of triceps brachii|^Anconeus"),
    R(M + "ForearmFlexors{S}", r"^Flexor carpi radialis$|^Palmaris longus|head of flexor carpi ulnaris|head of flexor digitorum superficialis|^Flexor digitorum profundus$|^Flexor pollicis longus$|head of pronator teres|^Pronator quadratus"),
    R(M + "ForearmExtensors{S}", r"^Brachioradialis|^Extensor carpi radialis (brevis|longus)$|^Extensor digitorum$|^Extensor digiti minimi$|head of extensor carpi ulnaris|^Supinator|^Abductor pollicis longus$|^Extensor pollicis (brevis|longus)$|^Extensor indicis$"),
    R(M + "Hand{S}", r"^Abductor pollicis brevis$|head of flexor pollicis brevis|^Opponens pollicis|head of adductor pollicis|of hand$|^Palmar interossei"),
    R(M + "GluteusMaximus{S}", r"^Gluteus maximus muscle$"),
    R(M + "GluteusMedius{S}", r"^Gluteus medius muscle$"),
    R(M + "GluteusMinimus{S}", r"^Gluteus minimus muscle$"),
    R(M + "DeepHipRotators{S}", r"^Piriformis muscle$|^Obturator (externus|internus)$|gemellus muscle$|^Quadratus femoris"),
    R(M + "Quadriceps{S}", r"^Rectus femoris|^Vastus"),
    R(M + "Sartorius{S}", r"^Sartorius muscle$"),
    R(M + "Adductors{S}", r"^Adductor (brevis|longus|magnus)$|^\(Adductor minimus\)$|^Pectineus|^Gracilis"),
    R(M + "Hamstrings{S}", r"head of biceps femoris|^Semitendinosus|^Semimembranosus muscle"),
    R(M + "Gastrocnemius{S}", r"head of gastrocnemius|^Calcaneal tendon"),
    R(M + "Soleus{S}", r"^Soleus|^Plantaris"),
    R(M + "TibialisAnterior{S}", r"^Tibialis anterior muscle$"),
    R(M + "LegExtensors{S}", r"^Extensor digitorum longus$|^Extensor hallucis longus$|^Fibularis tertius|^Tendon of extensor digitorum longus$"),
    R(M + "Fibulares{S}", r"^Fibularis (longus|brevis) muscle$"),
    R(M + "LegDeepFlexors{S}", r"^Tibialis posterior muscle$|^Flexor digitorum longus$|^Flexor hallucis longus$|^Popliteus"),
    R(M + "Foot{S}", r"^Abductor hallucis$|^Flexor digitorum brevis$|of foot\)?$|^Quadratus plantae|head of flexor hallucis brevis|head of adductor hallucis|^Plantar interossei|^Extensor digitorum brevis$|^Extensor hallucis brevis$"),
]

V = "VESSEL_"
RULES["5: Cardiovascular system"] = [
    R(DROP, r"penis|testicular|pudendal|ciliary|retinal|^\?|Basilar venous plexus"),
    R("ORG_Heart_LeftAtrium", r"^Left atrium$"), R("ORG_Heart_RightAtrium", r"^Right atrium$"),
    R("ORG_Heart_LeftVentricle", r"^Left ventricle$|of left ventricle$", r"(^|> )Heart\.g"),
    R("ORG_Heart_RightVentricle", r"^Right ventricle$|of right ventricle$", r"(^|> )Heart\.g"),
    R("ORG_Heart_Valves", None, r"Valvular complex"),
    R(V + "Aorta_Ascending", r"^Ascending aorta$"), R(V + "Aorta_Arch", r"^Aortic arch$"),
    R(V + "Aorta_Thoracic", r"^Thoracic aorta$"), R(V + "Aorta_Abdominal", r"^Abdominal aorta$"),
    R(V + "VenaCava_Superior", r"^Superior vena cava$"), R(V + "VenaCava_Inferior", r"^Inferior vena cava"),
    R(V + "PulmonaryTrunk", r"^Pulmonary trunk$|^Bifurcation of pulmonary trunk$"),
    R(V + "PulmonaryArtery_L", r"^Left pulmonary artery$|of left lung$", r"Pulmonary arteries"),
    R(V + "PulmonaryArtery_R", r"^Right pulmonary artery$|of right lung$", r"Pulmonary arteries"),
    R(V + "PulmonaryVeins_L", r"^Left \w+ pulmonary vein$|of left lung$", r"Pulmonary veins"),
    R(V + "PulmonaryVeins_R", r"^Right \w+ pulmonary vein$|of right lung$", r"Pulmonary veins"),
    R(V + "CoronaryArteries", None, r"Arteries of heart"),
    R(V + "CardiacVeins", None, r"Cardiac veins"),
    # arteries
    R(V + "BrachiocephalicTrunk", r"^Brachiocephalic trunk$"),
    R(V + "Carotid_L", r"^Left common carotid artery$"), R(V + "Carotid_R", r"^Right common carotid artery$"),
    R(V + "Carotid{S}", r"^(Internal|External) carotid artery$"),
    R(V + "Vertebral{S}", r"^Vertebral artery$"),
    R(V + "IntracranialArteries", None, r"Internal carotid artery|Vertebral artery|Cerebral arterial circle|Arteries of spinal cord"),
    R(V + "HeadNeckArteries{S}", None, r"External carotid artery"),
    R(V + "Subclavian_L", r"^Left subclavian artery$"), R(V + "Subclavian_R", r"^Right subclavian artery$"),
    R(V + "Subclavian{S}", r"^Axillary artery$"),
    R(V + "Brachial{S}", r"^Brachial artery$"), R(V + "Radial{S}", r"^Radial artery$"), R(V + "Ulnar{S}", r"^Ulnar artery$"),
    R(V + "HandArteries{S}", r"palmar|carpal|digital arteries of hand", r"Axillary artery"),
    R(V + "ArmArteries{S}", None, r"Axillary artery"),
    R(V + "SubclavianBranches{S}", None, r"subclavian artery"),
    R(V + "CommonIliac{S}", r"^Common iliac artery$"),
    R(V + "ExternalIliac{S}", r"^External iliac artery$"),
    R(V + "InternalIliac{S}", r"^Internal iliac artery$|division of internal iliac artery$"),
    R(V + "Femoral{S}", r"^Femoral artery$|^Deep femoral artery$"),
    R(V + "Popliteal{S}", r"^Popliteal artery$"),
    R(V + "Tibial{S}", r"^(Anterior|Posterior) tibial artery$|^Fibular artery$"),
    R(V + "FootArteries{S}", r"plantar|dorsalis pedis|tarsal|arcuate|of foot$|calcaneal", r"Popliteal artery"),
    R(V + "LegArteries{S}", None, r"Femoral artery"),
    R(V + "RenalArtery_L", r"^Left renal artery$|arteries of left kidney$"),
    R(V + "RenalArtery_R", r"^Right renal artery$|arteries of right kidney$"),
    R(V + "RenalArtery{S}", r"branch of renal artery$"),
    R(V + "VisceralArteries", r"coeliac|hepatic|splenic|\bgastric|gastroduodenal|mesenteric|colic|ileal|appendicular|sigmoid|anorectal|pancreatic|^Marginal artery$", r"Systemic arteries"),
    R(V + "PelvicArteries{S}", None, r"Aortic bifurcation"),
    R(V + "TrunkArteries{S}", None, r"Systemic arteries"),
    # veins
    R(V + "DuralSinuses", None, r"Dural venous sinuses"),
    R(V + "JugularVein{S}", r"^(Internal|External|Anterior) jugular vein$"),
    R(V + "HeadNeckVeins{S}", None, r"Orbital veins|Internal jugular vein|External jugular vein"),
    R(V + "BrachiocephalicVein_L", r"^Left brachiocephalic vein$"), R(V + "BrachiocephalicVein_R", r"^Right brachiocephalic vein$"),
    R(V + "SubclavianVein_L", r"^Left subclavian vein$"), R(V + "SubclavianVein_R", r"^Right subclavian vein$"),
    R(V + "SubclavianVein{S}", r"^Axillary vein$"),
    R(V + "ArmVeins{S}", None, r"Axillary vein"),
    R(V + "AzygosVeins", r"zygos", r"Systemic veins"), R(V + "AzygosVeins", None, r"Azygos vein"),
    R(V + "PortalVein", r"^Hepatic portal vein$"), R(V + "PortalVein", None, r"Hepatic portal vein"),
    R(V + "HepaticVeins", r"^Hepatic veins$"),
    R(V + "RenalVein_L", r"^Left renal vein$|veins of left kidney$"),
    R(V + "RenalVein_R", r"^Right renal vein$|veins of right kidney$"),
    R(V + "IliacVein{S}", r"^(Common|External|Internal) iliac vein$"),
    R(V + "FemoralVein{S}", r"^Femoral vein$|^Deep femoral vein$"),
    R(V + "PoplitealVein{S}", r"^Popliteal vein$"),
    R(V + "SaphenousVein{S}", r"saphenous vein$"),
    R(V + "LegVeins{S}", None, r"Femoral vein"),
    R(V + "TrunkVeins{S}", None, r"Systemic veins"),
]

RULES["6: Lymphoid organs"] = [
    R("ORG_Spleen", r"^Spleen$"), R("ORG_Thymus", r"lobe of thymus$"),
    R("LYMPH_Tonsils", r"tonsil"),
    R("LYMPH_Nodes_HeadNeck", None, r"Lymph nodes of (head|neck)"),
    R("LYMPH_Nodes_UpperLimb{S}", None, r"Lymph nodes of upper limb"),
    R("LYMPH_Nodes_LowerLimb{S}", None, r"Lymph nodes of lower limb"),
    R("LYMPH_Nodes_Thoracic", None, r"Thoracic lymph nodes"),
    R("LYMPH_Nodes_Abdominal", None, r"Abdominal lymph nodes"),
    R("LYMPH_Nodes_Pelvic", None, r"Pelvic lymph nodes"),
]

N = "SYS_Nerve_"
RULES["7: Nervous system & Sense organs"] = [
    R("BODY_Eye{S}", r"^(Sclera|Cornea)$"),
    R(DROP, None, r"> Sense organs\.g|Meninges"),
    R(DROP, r"^White matter of telencephalon$"),
    R("ORG_Brain_Cerebrum", r"gyrus|gyri|sulcus|sulci|lobule|pole$|insula|cuneus|^Lat_Fis|^Temporal plane|Sulcus interm", r"Cerebrum"),
    R("ORG_Brain_DeepStructures", None, r"Cerebrum"),
    R("ORG_Brain_Cerebellum", None, r"Cerebellum"),
    R("ORG_Brain_Brainstem", r"^(Midbrain|Pons|Medulla oblongata|Pyramid of medulla oblongata|Olive|Superior colliculus|Inferior colliculus|Base of peduncle|Superior cerebellar peduncle)$", r"Brainstem"),
    R(DROP, None, r"Brainstem"),
    R("SYS_SpinalCord", r"^White matter of spinal cord$"),
    R(DROP, None, r"Spinal cord\.g"),
    R(N + "CaudaEquina", r"^Cauda equina$"),
    R(N + "SpinalRoots{S}", r"root of spinal nerve$|^Spinal ganglion$"),
    R(N + "SympatheticTrunk{S}", None, r"Autonomic division"),
    R(N + "Vagus{S}", r"^Vagus nerve"),
    R(N + "Cranial{S}", None, r"Cranial nerves"), R(N + "Cranial{S}", r"\((I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)\)$"),
    R(N + "BrachialPlexus{S}", r"brachial plexus|^(Dorsal scapular|Suprascapular|Subclavian|Long thoracic|Lateral pectoral|Medial pectoral|Superior subscapular|Inferior subscapular|Thoracodorsal) nerve$", r"Brachial plexus"),
    R(N + "Median{S}", r"median nerve|^Anterior interosseous nerve", r"Brachial plexus"),
    R(N + "Ulnar{S}", r"ulnar nerve", r"Brachial plexus"),
    R(N + "Radial{S}", r"radial nerve|^Posterior interosseous nerve|^Posterior antebrachial cutaneous|^Inferior lateral brachial cutaneous", r"Brachial plexus"),
    R(N + "Musculocutaneous{S}", r"^Musculocutaneous|^Lateral antebrachial cutaneous", r"Brachial plexus"),
    R(N + "Axillary{S}", r"axillary nerve|^Superior lateral brachial cutaneous", r"Brachial plexus"),
    R(N + "ArmCutaneous{S}", None, r"Brachial plexus"),
    R(N + "Sciatic{S}", r"^Sciatic nerve$"),
    R(N + "Fibular{S}", r"fibular nerve|dorsal cutaneous nerve of foot"),
    R(N + "Tibial{S}", r"^Tibial nerve|plantar nerve|sural"),
    R(N + "Femoral{S}", r"^Femoral nerve$|^Anterior cutaneous branches of femoral nerve$|saphenous nerve"),
    R(N + "Obturator{S}", r"obturator nerve"),
    R(N + "LumbosacralPlexus{S}", None, r"Lumbosacral plexus|Lumbar nerves"),
    R(N + "Intercostal{S}", None, r"Thoracic nerves"),
]

RULES["8: Visceral systems"] = [
    R(DROP, None, r"Genital systems|Peritoneal|Thoracic cavity"),
    R("ORG_Esophagus", r"^Oesophagus$"), R("ORG_Stomach", r"^Stomach$"),
    R("ORG_Liver", r"^Liver$"), R("ORG_Gallbladder", r"^Gallbladder$"), R("SYS_BileDuct", r"^Bile duct$"),
    R("ORG_Pancreas", r"^Pancreas$"),
    R("ORG_SmallIntestine", r"^Duodenum$|^Jejunum$"),
    R("ORG_LargeIntestine", r"colon$|^Vermiform appendix$"),
    R("ORG_Tongue", r"^Tongue$"),
    R("GLAND_Salivary{S}", r"^(Parotid|Submandibular|Sublingual) gland$|Accessory parotid gland"),
    R("SYS_Pharynx", r"pharynx$"),
    R("SYS_NasalCavity", r"^Mucosa of nasal cavity$"),
    R("SYS_Larynx", r"^Epiglottis$"),
    R("SYS_Trachea", r"^Trachea$"),
    R("SYS_Bronchi_L", r"^Left (main|superior lobar|inferior lobar) bronchus$|bronchus of left lung", r"Bronchi"),
    R("SYS_Bronchi_R", None, r"Bronchi"),
    R("ORG_Lung_L_SuperiorLobe", r"^Superior lobe of left lung$"), R("ORG_Lung_L_InferiorLobe", r"^Inferior lobe of left lung$"),
    R("ORG_Lung_R_SuperiorLobe", r"^Superior lobe of right lung$"), R("ORG_Lung_R_MiddleLobe", r"^Middle lobe of right lung$"),
    R("ORG_Lung_R_InferiorLobe", r"^Inferior lobe of right lung$"),
    R("ORG_Kidney{S}", r"^Kidney$"), R("SYS_Ureter{S}", r"^Ureter$|^Renal pelvis$"),
    R("ORG_Bladder", r"^Urinary bladder$"), R("SYS_Urethra", r"^Urethra$"),
    R("GLAND_Pituitary", r"hypophysis$"), R("GLAND_Pineal", r"^Pineal gland$"),
    R("GLAND_Thyroid", r"^Thyroid gland$"), R("GLAND_Parathyroid", r"parathyroid gland$"),
    R("GLAND_Adrenal{S}", r"^Suprarenal gland$"),
]

SKIN_EXCLUDE = re.compile(r"Hairs|Eyelashes|Pubic|^Urogenital region")
SKIN_NAILS = re.compile(r"^Nail plate|^Perionyx \(foot\)")  # loose shells in the source: kept as BODY_Nails

# ---- body regions (ids are stored per skin face / vertex and in the regions manifest)
REGION_IDS = {name: i + 1 for i, name in enumerate([
    "HEAD", "NECK", "CHEST_ANTERIOR", "CHEST_POSTERIOR", "ABDOMEN", "PELVIS",
    "SHOULDER_LEFT", "SHOULDER_RIGHT", "UPPER_ARM_LEFT", "UPPER_ARM_RIGHT",
    "FOREARM_LEFT", "FOREARM_RIGHT", "HAND_LEFT", "HAND_RIGHT",
    "THIGH_LEFT", "THIGH_RIGHT", "KNEE_LEFT", "KNEE_RIGHT",
    "CALF_LEFT", "CALF_RIGHT", "FOOT_LEFT", "FOOT_RIGHT",
])}
# source skin patch -> region ({SIDE} = LEFT/RIGHT). First match wins.
REGION_RULES = [(re.compile(p, re.I), r) for p, r in [
    (r"^Deltoid region$", "SHOULDER_{SIDE}"),
    (r"region of arm$|bicipital groove$", "UPPER_ARM_{SIDE}"),
    (r"region of elbow$|^Cubital fossa$|region of forearm$|border of forearm$|region of wrist$", "FOREARM_{SIDE}"),
    (r"^Palm$|of hand$|^Radial foveola$|^Nail plate$|^Perionyx$", "HAND_{SIDE}"),
    (r"region of thigh$|^Femoral triangle$", "THIGH_{SIDE}"),
    (r"region of knee$|^Popliteal fossa$", "KNEE_{SIDE}"),
    (r"region of leg$", "CALF_{SIDE}"),
    (r"ankle$|malleol|^Heel region$|of foot$|^Sole$|^Metatarsal region$|^Hallucial eminence$|\(foot\)$", "FOOT_{SIDE}"),
    (r"neck$|^Sternocleidomastoid region$|triangle$(?<!Deltopectoral triangle)(?<!Femoral triangle)|supraclavicular fossa$", "NECK"),
    (r"^Presternal region$|^Pectoral region$|^Mammary region$|^Inframammary region$|^Infraclavicular fossa$|^Deltopectoral triangle$", "CHEST_ANTERIOR"),
    (r"^Lateral region of thorax$", "CHEST_SPLIT"),          # split front / back by the coronal mid-plane
    (r"^Scapular region$|^Interscapular region$|^Infrascapular region$|^Triangle of auscultation$", "CHEST_POSTERIOR"),
    (r"^Vertebral region$", "BACK_SPLIT"),                  # thoracic part -> chest posterior, lumbar -> abdomen
    (r"^Epigastric region$|^Hypochondriac region$|^Umbilical region$|^Umbilicus$|^Lateral region of abdomen$|^Lumbar region$", "ABDOMEN"),
    (r"^Hypogastric region$|^Inguinal region$|^Hip region$|^Gluteal region$|^Gluteal fold$|^Sacral region$|^Anal region$", "PELVIS"),
    (r".", "HEAD"),
]]
DELTOID_REGION_NAME = "REGION_SHOULDER_RIGHT_DELTOID"

# ---- target metadata helpers
GROUP_PARENTS = [  # (child name regex, parent empty, parent display name)
    (r"^BONE_(Cranium|Mandible|Teeth_)", "BONE_Skull", "Skull"),
    (r"^ORG_Heart_", "ORG_Heart", "Heart"),
    (r"^VESSEL_(CoronaryArteries|CardiacVeins)$", "ORG_Heart", "Heart"),
    (r"^VESSEL_Aorta_", "VESSEL_Aorta", "Aorta"),
    (r"^VESSEL_VenaCava_", "VESSEL_VenaCava", "Venae cavae"),
    (r"^ORG_Lung_L_", "ORG_Lung_L", "Left lung"),
    (r"^ORG_Lung_R_", "ORG_Lung_R", "Right lung"),
    (r"^ORG_Brain_", "ORG_Brain", "Brain"),
]
SYSTEM_BY_TARGET = [  # first match wins
    (r"^BODY_", "external"), (r"^BONE_", "skeletal"),
    (r"^MUSCLE_Diaphragm$|^ORG_Lung|^SYS_(Trachea|Bronchi|Larynx|Pharynx|NasalCavity)", "respiratory"),
    (r"^MUSCLE_", "muscular"), (r"^ORG_Heart|^VESSEL_", "cardiovascular"),
    (r"^ORG_Brain|^SYS_SpinalCord|^SYS_Nerve_", "nervous"),
    (r"^ORG_(Esophagus|Stomach|Liver|Gallbladder|Pancreas|SmallIntestine|LargeIntestine|Rectum|Tongue)|^SYS_BileDuct|^GLAND_Salivary", "digestive"),
    (r"^ORG_(Kidney|Bladder)|^SYS_(Ureter|Urethra)", "urinary"),
    (r"^GLAND_", "endocrine"), (r"^ORG_(Spleen|Thymus)|^LYMPH_", "lymphatic"),
]
MATERIAL_BY_TARGET = [
    (r"^BODY_", "MAT_Body_Base"),
    (r"^BONE_(CostalCartilages|IntervertebralDiscs)|^SYS_Larynx", "MAT_Skeleton_Cartilage"),
    (r"^BONE_", "MAT_Skeleton_Base"), (r"^MUSCLE_", "MAT_Muscular_Base"),
    (r"^ORG_Heart", "MAT_Cardiovascular_Base"),
    # colour = oxygenation: pulmonary arteries carry deoxygenated blood, pulmonary veins oxygenated
    (r"^VESSEL_PulmonaryVeins", "MAT_Cardiovascular_Artery"),
    (r"^VESSEL_(PulmonaryTrunk|PulmonaryArtery)|^VESSEL_.*(Vein|Veins|VenaCava|Sinuses)", "MAT_Cardiovascular_Vein"),
    (r"^VESSEL_", "MAT_Cardiovascular_Artery"),
    (r"^ORG_Lung", "MAT_Respiratory_Base"), (r"^SYS_(Trachea|Bronchi|Pharynx|NasalCavity)", "MAT_Respiratory_Airway"),
    (r"^ORG_Brain", "MAT_Nervous_Base"), (r"^SYS_SpinalCord|^SYS_Nerve_", "MAT_Nervous_Nerve"),
    (r"^ORG_Liver", "MAT_Organ_Liver"), (r"^ORG_(Stomach|Esophagus)", "MAT_Organ_Stomach"),
    (r"^ORG_(SmallIntestine|LargeIntestine|Rectum)", "MAT_Organ_Intestine"), (r"^ORG_Pancreas", "MAT_Organ_Pancreas"),
    (r"^ORG_Gallbladder|^SYS_BileDuct", "MAT_Organ_Gallbladder"), (r"^ORG_Kidney", "MAT_Organ_Kidney"),
    (r"^ORG_Bladder|^SYS_(Ureter|Urethra)", "MAT_Organ_Bladder"), (r"^ORG_Spleen", "MAT_Organ_Spleen"),
    (r"^GLAND_Salivary|^ORG_Tongue", "MAT_Organ_Base"), (r"^GLAND_", "MAT_Endocrine_Base"),
    (r"^ORG_Thymus|^LYMPH_", "MAT_Lymphatic_Base"), (r".", "MAT_Organ_Base"),
]
VISUALIZATION_TYPE = [
    (r"^ORG_Heart|^VESSEL_(CoronaryArteries|CardiacVeins)$|^ORG_Lung|^MUSCLE_Diaphragm$", "morph_animation"),
    (r"^BODY_Skin$", "surface_heatmap"), (r"^BONE_", "bone_highlight"),
    (r"^VESSEL_|^LYMPH_(Vessels|ThoracicDuct|Trunks)", "vessel_path"), (r"^SYS_Nerve_|^SYS_SpinalCord", "nerve_path"),
    (r"^MUSCLE_", "muscle_highlight"), (r".", "organ_highlight"),
]

def first(table, name):
    for pat, val in table:
        if re.search(pat, name):
            return val
    return None

NAMES = {  # object name without prefix and side -> anatomical display name
    "Skin": "Skin (external body surface)", "Eye": "Eyeball", "Nails": "Nails of fingers and toes",
    "Skull": "Skull", "Cranium": "Cranium", "Teeth_Upper": "Upper teeth", "Teeth_Lower": "Lower teeth",
    "Hyoid": "Hyoid bone", "CostalCartilages": "Costal cartilages", "Carpals": "Carpal bones",
    "Metacarpals": "Metacarpal bones", "Phalanges_Hand": "Phalanges of hand", "Hip": "Hip bone",
    "Tarsals": "Tarsal bones", "Metatarsals": "Metatarsal bones", "Phalanges_Foot": "Phalanges of foot",
    "IntervertebralDiscs": "Intervertebral discs",
    "ErectorSpinae_Iliocostalis": "Erector spinae (iliocostalis)", "ErectorSpinae_Longissimus": "Erector spinae (longissimus)",
    "ErectorSpinae_Spinalis": "Erector spinae (spinalis)", "Transversospinales": "Transversospinal muscles",
    "Rhomboids": "Rhomboid muscles", "Scalenes": "Scalene muscles", "Infrahyoid": "Infrahyoid muscles",
    "Suprahyoid": "Suprahyoid muscles", "Prevertebral": "Prevertebral muscles", "Pterygoids": "Pterygoid muscles",
    "Facial": "Facial muscles and epicranial aponeurosis", "RotatorCuff": "Rotator cuff muscles",
    "Biceps": "Biceps brachii", "Brachialis": "Brachialis and coracobrachialis", "Triceps": "Triceps brachii",
    "ForearmFlexors": "Forearm flexor group", "ForearmExtensors": "Forearm extensor group",
    "Hand": "Intrinsic muscles of hand", "Foot": "Intrinsic muscles of foot", "DeepHipRotators": "Deep hip rotators",
    "Quadriceps": "Quadriceps femoris", "Adductors": "Adductor group", "Hamstrings": "Hamstrings",
    "LegExtensors": "Long toe extensors", "Fibulares": "Fibularis longus and brevis",
    "LegDeepFlexors": "Deep posterior leg muscles", "PelvicFloor": "Pelvic floor muscles",
    "Intercostals": "Intercostal muscles", "TensorFasciaeLatae": "Tensor fasciae latae and iliotibial tract",
    "Suboccipitals": "Suboccipital muscles", "Gastrocnemius": "Gastrocnemius and calcaneal tendon",
    "Soleus": "Soleus and plantaris", "Iliopsoas": "Iliopsoas", "Splenius": "Splenius muscles",
    "Heart": "Heart", "Heart_LeftAtrium": "Left atrium", "Heart_RightAtrium": "Right atrium",
    "Heart_LeftVentricle": "Left ventricle", "Heart_RightVentricle": "Right ventricle",
    "Heart_Septum": "Interventricular septum", "Heart_Valves": "Heart valves",
    "Aorta": "Aorta", "Aorta_Ascending": "Ascending aorta", "Aorta_Arch": "Aortic arch",
    "Aorta_Thoracic": "Descending thoracic aorta", "Aorta_Abdominal": "Abdominal aorta",
    "VenaCava": "Venae cavae", "VenaCava_Superior": "Superior vena cava", "VenaCava_Inferior": "Inferior vena cava",
    "PulmonaryArtery": "Pulmonary artery and branches", "PulmonaryVeins": "Pulmonary veins",
    "Carotid": "Common, internal and external carotid arteries", "Vertebral": "Vertebral artery",
    "IntracranialArteries": "Intracranial and orbital arteries", "HeadNeckArteries": "Arteries of head and neck",
    "Subclavian": "Subclavian and axillary artery", "SubclavianBranches": "Branches of subclavian artery",
    "Brachial": "Brachial artery", "Radial": "Radial artery", "Ulnar": "Ulnar artery",
    "HandArteries": "Arteries of hand", "ArmArteries": "Arterial branches of upper limb",
    "CommonIliac": "Common iliac artery", "ExternalIliac": "External iliac artery", "InternalIliac": "Internal iliac artery",
    "Femoral": "Femoral and deep femoral artery", "Popliteal": "Popliteal artery",
    "Tibial": "Anterior tibial, posterior tibial and fibular arteries", "FootArteries": "Arteries of foot",
    "LegArteries": "Arterial branches of lower limb", "VisceralArteries": "Visceral branches of abdominal aorta",
    "PelvicArteries": "Pelvic arterial branches", "TrunkArteries": "Parietal arteries of trunk",
    "DuralSinuses": "Dural venous sinuses", "JugularVein": "Jugular veins", "HeadNeckVeins": "Veins of head and neck",
    "SubclavianVein": "Subclavian and axillary vein", "ArmVeins": "Veins of upper limb",
    "AzygosVeins": "Azygos venous system", "PortalVein": "Hepatic portal vein and tributaries",
    "IliacVein": "Iliac veins", "FemoralVein": "Femoral and deep femoral vein",
    "SaphenousVein": "Great and small saphenous veins", "LegVeins": "Veins of lower limb",
    "TrunkVeins": "Parietal veins of trunk",
    "Lung": "Lung", "Lung_L_SuperiorLobe": "Superior lobe of left lung", "Lung_L_InferiorLobe": "Inferior lobe of left lung",
    "Lung_R_SuperiorLobe": "Superior lobe of right lung", "Lung_R_MiddleLobe": "Middle lobe of right lung",
    "Lung_R_InferiorLobe": "Inferior lobe of right lung", "Bronchi": "Bronchial tree",
    "NasalCavity": "Nasal cavity", "Brain": "Brain", "Brain_Cerebrum": "Cerebrum (cerebral cortex)",
    "Brain_DeepStructures": "Deep cerebral structures and ventricles", "Brain_Cerebellum": "Cerebellum",
    "Brain_Brainstem": "Brainstem", "SpinalCord": "Spinal cord",
    "Nerve_Cranial": "Cranial nerves", "Nerve_BrachialPlexus": "Brachial plexus",
    "Nerve_ArmCutaneous": "Cutaneous nerves of upper limb", "Nerve_Fibular": "Common, deep and superficial fibular nerves",
    "Nerve_Tibial": "Tibial nerve and branches", "Nerve_Femoral": "Femoral and saphenous nerves",
    "Nerve_LumbosacralPlexus": "Lumbosacral plexus branches", "Nerve_Intercostal": "Intercostal nerves",
    "Nerve_SympatheticTrunk": "Sympathetic trunk", "Nerve_SpinalRoots": "Spinal nerve roots and ganglia",
    "Nerve_CaudaEquina": "Cauda equina",
    "SmallIntestine": "Small intestine (duodenum, jejunum, ileum)", "LargeIntestine": "Large intestine (colon, appendix)",
    "Rectum": "Rectum", "BileDuct": "Bile duct", "Esophagus": "Esophagus", "Urethra": "Urethra (pelvic part)",
    "Salivary": "Salivary glands", "Ureter": "Ureter and renal pelvis", "Bladder": "Urinary bladder",
    "Pituitary": "Pituitary gland", "Pineal": "Pineal gland", "Thyroid": "Thyroid gland",
    "Parathyroid": "Parathyroid glands", "Adrenal": "Adrenal gland", "Tonsils": "Palatine tonsils",
    "Nodes_HeadNeck": "Lymph nodes of head and neck", "Nodes_UpperLimb": "Lymph nodes of upper limb (axillary, cubital)",
    "Nodes_LowerLimb": "Lymph nodes of lower limb (inguinal, popliteal)", "Nodes_Thoracic": "Thoracic lymph nodes",
    "Nodes_Abdominal": "Abdominal lymph nodes", "Nodes_Pelvic": "Pelvic lymph nodes",
    "ThoracicDuct": "Thoracic duct and cisterna chyli (schematic)", "Vessels_UpperLimb": "Lymphatic pathways of upper limb (schematic)",
    "Vessels_LowerLimb": "Lymphatic pathways of lower limb (schematic)", "Trunks": "Lumbar, jugular and subclavian lymphatic trunks, right lymphatic duct (schematic)",
}

def display_name(target):
    """Human readable anatomy name from a stable object name."""
    body = re.sub(r"^(BODY|BONE|MUSCLE|ORG|VESSEL|SYS|GLAND|LYMPH)_", "", target)
    side = {"left": " (left)", "right": " (right)"}.get(side_of(target), "")
    if body in NAMES:                       # names that already carry their side
        return NAMES[body]
    body = re.sub(r"_[LR]$", "", body)
    m = re.match(r"Vertebra_([CTL]\d+)$", body)
    if m:
        return "Vertebra " + m.group(1)
    m = re.match(r"Rib_(\d+)$", body)
    if m:
        return "Rib %d%s" % (int(m.group(1)), side)
    if body in NAMES:
        return NAMES[body] + side
    nerve = body.startswith("Nerve_")
    words = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", body.replace("Nerve_", "").replace("_", " ")).lower()
    return words.capitalize() + (" nerve" if nerve else "") + side

def side_of(target):
    if re.search(r"_L(_|$)", target):
        return "left"
    if re.search(r"_R(_|$)", target):
        return "right"
    return "midline"

def resolve(source_name, collection, path, centroid_x):
    """Return the target object name for a source object, or None to drop it."""
    base = re.sub(r"\.(l|r)$", "", source_name)
    suf = {".l": "_L", ".r": "_R"}.get(source_name[-2:], None)
    if suf is None:
        if re.match(r"left\b", base, re.I) or re.search(r"\bleft\b", base, re.I):
            suf = "_L"
        elif re.search(r"\bright\b", base, re.I):
            suf = "_R"
        else:
            suf = "_L" if centroid_x > 0.012 else "_R" if centroid_x < -0.012 else ""
    for target, name_re, path_re in RULES.get(collection, ()):
        m = name_re.search(base) if name_re else True
        if not m or (path_re and not path_re.search(path)):
            continue
        if target is None:
            return None
        if "{1}" in target:
            target = target.replace("{1}", m.group(1))
        if "{ORD}" in target:
            if m.group(1) not in ORD:
                return None
            target = target.replace("{ORD}", "%02d" % ORD[m.group(1)])
        return target.replace("{S}", suf)
    return None
